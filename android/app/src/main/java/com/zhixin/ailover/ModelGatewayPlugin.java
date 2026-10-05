package com.zhixin.ailover;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/** Direct, bounded model transport. The shared TypeScript composer owns all persona logic. */
@CapacitorPlugin(name = "ModelGateway")
public class ModelGatewayPlugin extends Plugin {
    private static final int CONNECT_TIMEOUT_MS = 30_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int FIRST_TEXT_TIMEOUT_MS = 30_000;
    private static final int TOTAL_TIMEOUT_MS = 90_000;
    private static final int MAX_ACTIVE = 4;
    private static final int MAX_RESPONSE_BYTES = 2_000_000;
    private static final int MAX_EVENT_CHARACTERS = 1_000_000;
    private static final int MAX_OUTPUT_CHARACTERS = 20_000;
    private static final Pattern REQUEST_ID = Pattern.compile("[A-Za-z0-9._:-]{1,100}");
    private static final Pattern TOKEN_PLAN_KEY = Pattern.compile("^(?:tp|ttp)-", Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_CHAT_MIMO = Pattern.compile("-(?:asr|tts)(?:-|$)", Pattern.CASE_INSENSITIVE);
    private static final Pattern KEY_IN_ERROR = Pattern.compile("(?:sk|tp|ttp)-[A-Za-z0-9._-]+", Pattern.CASE_INSENSITIVE);
    private static final Set<String> MIMO_BASES = new HashSet<>(Arrays.asList(
        "https://token-plan-cn.xiaomimimo.com/v1",
        "https://token-plan-sgp.xiaomimimo.com/v1",
        "https://token-plan-ams.xiaomimimo.com/v1",
        "https://api.xiaomimimo.com/v1"
    ));
    private static final Set<String> NON_THINKING_MODELS = new HashSet<>(Arrays.asList(
        "Qwen/Qwen3-8B", "Qwen/Qwen3-14B", "Qwen/Qwen3-32B",
        "Qwen/Qwen3-30B-A3B", "Qwen/Qwen3-235B-A22B"
    ));

    private final ConcurrentHashMap<String, Operation> operations = new ConcurrentHashMap<>();
    private final ExecutorService workers = Executors.newFixedThreadPool(MAX_ACTIVE);
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean destroyed = new AtomicBoolean(false);
    private final Object reservationLock = new Object();

    @PluginMethod
    public void request(PluginCall call) {
        try {
            String id = requestId(call);
            String path = requiredString(call.getData(), "path", 30);
            if (!"/api/models".equals(path) && !"/api/test".equals(path)) {
                throw new GatewayException("原生网关仅支持模型列表和连接测试", 400);
            }
            JSONObject body = requiredObject(call.getData(), "body");
            Settings settings = validateSettings(body);
            Operation operation = reserve(id, settings, false, call);
            start(operation, () -> runRequest(operation, path));
        } catch (GatewayException error) {
            call.resolve(response(error.status, errorBody(error.getMessage())));
        } catch (Exception ignored) {
            call.resolve(response(400, errorBody("请求格式不正确")));
        }
    }

    @PluginMethod
    public void stream(PluginCall call) {
        String id;
        try {
            id = requestId(call);
        } catch (GatewayException error) {
            call.reject(error.getMessage(), "INVALID_REQUEST");
            return;
        }
        Operation operation;
        JSONArray messages;
        try {
            if (operations.containsKey(id)) throw new GatewayException("请求 ID 已在使用", 409);
            JSONObject body = requiredObject(call.getData(), "body");
            Settings settings = validateSettings(body);
            messages = validateMessages(body);
            operation = reserve(id, settings, true, null);
        } catch (GatewayException error) {
            // A duplicate ID must not terminate the already-running request with that ID.
            if (error.status == 409) {
                call.reject(error.getMessage(), "DUPLICATE_REQUEST");
                return;
            }
            call.resolve();
            emit(null, event(id, "error").put("message", error.getMessage()));
            return;
        } catch (Exception ignored) {
            call.resolve();
            emit(null, event(id, "error").put("message", "请求格式不正确"));
            return;
        }
        // Listeners are registered before this handshake; all subsequent events include the ID.
        call.resolve();
        start(operation, () -> runStream(operation, messages));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            Operation operation = operations.get(requestId(call));
            if (operation != null) cancelOperation(operation);
            call.resolve();
        } catch (GatewayException error) {
            call.reject(error.getMessage(), "INVALID_REQUEST");
        }
    }

    @Override
    protected void handleOnDestroy() {
        destroyed.set(true);
        for (Operation operation : operations.values()) cancelOperation(operation);
        workers.shutdownNow();
        deadlines.shutdownNow();
        super.handleOnDestroy();
    }

    private Operation reserve(String id, Settings settings, boolean streaming, PluginCall call)
        throws GatewayException {
        synchronized (reservationLock) {
            if (destroyed.get()) throw new GatewayException("原生网关已关闭", 503);
            if (operations.containsKey(id)) throw new GatewayException("请求 ID 已在使用", 409);
            if (operations.size() >= MAX_ACTIVE) throw new GatewayException("请求过多，请稍后重试", 429);
            Operation operation = new Operation(id, settings, streaming, call);
            operations.put(id, operation);
            return operation;
        }
    }

    private void start(Operation operation, Runnable task) {
        try {
            operation.firstDeadline = deadlines.schedule(
                () -> fail(operation, new GatewayException("模型 30 秒内未开始回复，请重试或切换更快的模型", 504)),
                FIRST_TEXT_TIMEOUT_MS, TimeUnit.MILLISECONDS
            );
            operation.totalDeadline = deadlines.schedule(
                () -> fail(operation, new GatewayException("回复超过时间限制，已停止本次请求", 504)),
                TOTAL_TIMEOUT_MS, TimeUnit.MILLISECONDS
            );
            operation.work = workers.submit(task);
            if (operation.terminal.get()) operation.work.cancel(true);
        } catch (RejectedExecutionException ignored) {
            fail(operation, new GatewayException("原生网关已关闭", 503));
        }
    }

    private void runRequest(Operation operation, String path) {
        try {
            operation.requireActive();
            if ("/api/models".equals(path)) {
                HttpURLConnection connection = open(operation, "/models" + (operation.settings.mimo ? "" : "?sub_type=chat"), null, false);
                requireSuccess(operation, connection);
                JSONObject upstream = new JSONObject(readText(connection.getInputStream(), MAX_RESPONSE_BYTES, operation));
                JSONArray data = upstream.optJSONArray("data");
                if (data == null) throw new GatewayException("模型列表格式不正确", 502);
                TreeSet<String> modelIds = new TreeSet<>();
                for (int i = 0; i < data.length(); i++) {
                    JSONObject item = data.optJSONObject(i);
                    if (item == null || !(item.opt("id") instanceof String)) continue;
                    String modelId = item.getString("id").trim();
                    if (modelId.isEmpty() || modelId.length() > 150 || hasControl(modelId)) continue;
                    if (operation.settings.mimo && NON_CHAT_MIMO.matcher(modelId).find()) continue;
                    modelIds.add(modelId);
                }
                if (modelIds.isEmpty()) throw new GatewayException("该服务没有返回可用的对话模型", 502);
                JSONObject result = new JSONObject();
                result.put("models", new JSONArray(modelIds));
                succeed(operation, result);
            } else {
                JSONArray messages = new JSONArray();
                messages.put(new JSONObject().put("role", "system").put("content", "直接回复简短中文文本，不解释、不调用工具。"));
                messages.put(new JSONObject().put("role", "user").put("content", "只回复：好"));
                int tokens = operation.settings.mimo ? 32 : 16;
                HttpURLConnection connection = open(operation, "/chat/completions", completionBody(operation.settings, messages, false, tokens), false);
                requireSuccess(operation, connection);
                JSONObject upstream = new JSONObject(readText(connection.getInputStream(), 100_000, operation));
                JSONArray choices = upstream.optJSONArray("choices");
                JSONObject choice = choices == null ? null : choices.optJSONObject(0);
                JSONObject message = choice == null ? null : choice.optJSONObject("message");
                if (choice == null || message == null) throw new GatewayException("模型未返回可显示文本，连接验证未通过", 502);
                String reason = finishReason(choice);
                if ("length".equals(reason)) {
                    throw new GatewayException("连接测试输出预算已用尽，请尝试快速模型", 502);
                }
                if (hasToolCalls(message)) reason = "tool_calls";
                requireFinishReason(reason);
                Object content = message.opt("content");
                if (!(content instanceof String) || ((String) content).trim().isEmpty()) {
                    throw new GatewayException("模型未返回可显示文本，连接验证未通过；请尝试其他模型", 502);
                }
                JSONObject result = new JSONObject().put("ok", true).put("latencyMs", operation.elapsed());
                succeed(operation, result);
            }
        } catch (Exception error) {
            fail(operation, classify(error, operation.settings.apiKey));
        } finally {
            operation.disconnect();
        }
    }

    private void runStream(Operation operation, JSONArray messages) {
        try {
            operation.requireActive();
            HttpURLConnection connection = open(operation, "/chat/completions", completionBody(operation.settings, messages, true, 384), true);
            requireSuccess(operation, connection);
            String contentType = connection.getContentType();
            if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT).contains("text/event-stream")) {
                throw new GatewayException("模型服务未返回 SSE 流，请检查模型和账户类型", 502);
            }
            SseState state = new SseState();
            try (InputStreamReader reader = new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)) {
                char[] buffer = new char[2048];
                int read;
                while (!state.finished && (read = reader.read(buffer)) != -1) {
                    operation.requireActive();
                    state.receivedCharacters += read;
                    if (state.receivedCharacters > MAX_RESPONSE_BYTES) {
                        throw new GatewayException("模型流数据超过允许大小", 502);
                    }
                    for (int i = 0; i < read && !state.finished; i++) {
                        char character = buffer[i];
                        if (state.atStart) {
                            state.atStart = false;
                            if (character == '\uFEFF') continue;
                        }
                        if (character == '\n' && state.previousCarriageReturn) {
                            state.previousCarriageReturn = false;
                            continue;
                        }
                        state.previousCarriageReturn = character == '\r';
                        if (character == '\r' || character == '\n') {
                            consumeLine(operation, state);
                        } else {
                            state.line.append(character);
                            if (state.line.length() > MAX_EVENT_CHARACTERS) {
                                throw new GatewayException("模型流数据异常：单行过长", 502);
                            }
                        }
                    }
                }
                if (!state.finished) {
                    if (state.line.length() > 0) consumeLine(operation, state);
                    if (state.hasData) consumeEvent(operation, state);
                }
            }
            operation.requireActive();
            if (!state.finished) throw new GatewayException("模型连接意外中断，回复可能不完整，请重试", 502);
            if (operation.firstTokenMs < 0) throw new GatewayException("模型未返回可显示文本，请切换模型重试", 502);
            if (operation.terminal.compareAndSet(false, true)) {
                release(operation);
                emit(operation, event(operation.id, "done")
                    .put("firstTokenMs", operation.firstTokenMs).put("totalMs", operation.elapsed()));
            }
        } catch (Exception error) {
            fail(operation, classify(error, operation.settings.apiKey));
        } finally {
            operation.disconnect();
        }
    }

    private void consumeLine(Operation operation, SseState state) throws Exception {
        String line = state.line.toString();
        state.line.setLength(0);
        if (line.isEmpty()) {
            if (state.hasData) consumeEvent(operation, state);
        } else if (line.startsWith("data:")) {
            String value = line.substring(5);
            if (value.startsWith(" ")) value = value.substring(1);
            if (state.hasData) state.data.append('\n');
            state.data.append(value);
            state.hasData = true;
            if (state.data.length() > MAX_EVENT_CHARACTERS) {
                throw new GatewayException("模型流数据异常：单个事件过长", 502);
            }
        }
    }

    private void consumeEvent(Operation operation, SseState state) throws Exception {
        operation.requireActive();
        String data = state.data.toString();
        state.data.setLength(0);
        state.hasData = false;
        CompletionChunk chunk = parseCompletionData(data, operation.settings.apiKey);
        if (chunk.text != null && !chunk.text.isEmpty()) {
            String text = chunk.text;
            state.outputCharacters += text.length();
            if (state.outputCharacters > MAX_OUTPUT_CHARACTERS) {
                throw new GatewayException("模型回复超过允许长度，已停止本次请求", 502);
            }
            if (operation.firstTokenMs < 0 && !text.trim().isEmpty()) {
                operation.firstTokenMs = operation.elapsed();
                if (operation.firstDeadline != null) operation.firstDeadline.cancel(false);
            }
            // reasoning_content is deliberately ignored and never sent to the WebView.
            emit(operation, event(operation.id, "delta").put("text", text));
        }
        // Preserve visible text even if this same frame reports an exhausted output budget.
        requireFinishReason(chunk.finishReason);
        state.finished = chunk.finished;
    }

    /** Pure parsing helper also used by native regression tests; no Android or network calls. */
    static CompletionChunk parseCompletionData(String data, String apiKey) throws Exception {
        if ("[DONE]".equals(data.trim())) return new CompletionChunk(null, true, null);
        JSONObject value = new JSONObject(data);
        if (value.has("error") && !value.isNull("error")) {
            throw new GatewayException(scrub(upstreamDetail(value), apiKey), 502);
        }
        JSONArray choices = value.optJSONArray("choices");
        if (choices == null) throw new GatewayException("模型返回了无效的流数据", 502);
        if (choices.length() == 0) return new CompletionChunk(null, false, null);
        JSONObject choice = choices.optJSONObject(0);
        if (choice == null) throw new GatewayException("模型返回了无效的流数据", 502);
        JSONObject delta = choice.optJSONObject("delta");
        String text = null;
        if (delta != null) {
            Object content = delta.opt("content");
            if (content != null && content != JSONObject.NULL && !(content instanceof String)) {
                throw new GatewayException("模型返回了不支持的文本格式", 502);
            }
            if (content instanceof String) text = (String) content;
            if (hasToolCalls(delta)) throw new GatewayException("模型尝试调用当前聊天不支持的工具，请切换模型", 502);
        }
        String reason = finishReason(choice);
        return new CompletionChunk(text, reason != null, reason);
    }

    private HttpURLConnection open(Operation operation, String suffix, JSONObject payload, boolean streaming)
        throws Exception {
        // The base was matched to a literal provider whitelist, not reconstructed from user input.
        HttpURLConnection connection = (HttpURLConnection) new URL(operation.settings.baseUrl + suffix).openConnection();
        operation.attach(connection);
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestProperty("Accept", streaming ? "text/event-stream" : "application/json");
        connection.setRequestProperty("Accept-Encoding", "identity");
        if (operation.settings.mimo) connection.setRequestProperty("api-key", operation.settings.apiKey);
        else connection.setRequestProperty("Authorization", "Bearer " + operation.settings.apiKey);
        if (payload == null) {
            connection.setRequestMethod("GET");
        } else {
            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            if (bytes.length > 200_000) throw new GatewayException("请求超过允许大小", 400);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setFixedLengthStreamingMode(bytes.length);
            operation.requireActive();
            try (OutputStream output = connection.getOutputStream()) {
                operation.requireActive();
                output.write(bytes);
            }
        }
        return connection;
    }

    private void requireSuccess(Operation operation, HttpURLConnection connection) throws Exception {
        operation.requireActive();
        int status = connection.getResponseCode();
        if (status >= 200 && status < 300) return;
        String detail = "";
        try {
            InputStream errorStream = connection.getErrorStream();
            if (errorStream != null) {
                detail = upstreamDetail(new JSONObject(readText(errorStream, 16_000, operation)));
            }
        } catch (Exception ignored) {
            // Never expose an HTML error page or an arbitrary non-JSON response.
        }
        String hint;
        switch (status) {
            case 401: hint = "API Key 无效或已过期"; break;
            case 403: hint = "没有权限访问该服务或模型"; break;
            case 404: hint = "模型或接口不存在"; break;
            case 429: hint = "上游限流或余额不足，请检查账户后重试"; break;
            default: hint = "模型服务暂时不可用";
        }
        throw new GatewayException(scrub("模型服务返回 " + status + "：" + (detail.isEmpty() ? hint : detail), operation.settings.apiKey), status == 429 ? 429 : 502);
    }

    private static String readText(InputStream stream, int limit, Operation operation) throws Exception {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int size = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                operation.requireActive();
                size += read;
                if (size > limit) throw new GatewayException("上游响应超过允许大小", 502);
                output.write(buffer, 0, read);
            }
            operation.requireActive();
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static JSONObject completionBody(Settings settings, JSONArray messages, boolean stream, int tokens)
        throws JSONException {
        JSONObject body = new JSONObject().put("model", settings.model).put("messages", messages).put("stream", stream);
        if (settings.mimo) {
            body.put("max_completion_tokens", tokens);
            body.put("temperature", Math.min(settings.temperature, 1.5));
            body.put("thinking", new JSONObject().put("type", "disabled"));
        } else {
            body.put("max_tokens", tokens).put("temperature", settings.temperature);
            if (NON_THINKING_MODELS.contains(settings.model)) body.put("enable_thinking", false);
        }
        return body;
    }

    static Settings validateSettings(JSONObject body) throws GatewayException {
        JSONObject settings = requiredObject(body, "settings");
        String provider = requiredString(settings, "provider", 40);
        String base = requiredString(settings, "baseUrl", 300);
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        boolean mimo = "mimo".equals(provider);
        boolean valid = mimo ? MIMO_BASES.contains(base)
            : "siliconflow".equals(provider) && "https://api.siliconflow.cn/v1".equals(base);
        if (!valid) throw new GatewayException("API 地址与服务不匹配；仅支持小米 MiMo 和硅基流动国内站官方端点", 400);
        String apiKey = requiredString(settings, "apiKey", 512);
        for (int i = 0; i < apiKey.length(); i++) {
            char character = apiKey.charAt(i);
            if (character <= 32 || character >= 127) throw new GatewayException("API Key 格式不正确", 400);
        }
        boolean planKey = TOKEN_PLAN_KEY.matcher(apiKey).find();
        boolean planEndpoint = mimo && !"https://api.xiaomimimo.com/v1".equals(base);
        if (planEndpoint && !planKey) throw new GatewayException("Token Plan 接口需要 tp-/ttp- 套餐 Key，请选择对应账户类型", 400);
        if (!planEndpoint && planKey) throw new GatewayException("套餐 Key 只能用于 MiMo Token Plan 专用地址，请选择对应服务区域", 400);
        String model = requiredString(settings, "model", 150);
        if (mimo && NON_CHAT_MIMO.matcher(model).find()) throw new GatewayException("语音识别和语音合成模型不能用于文字聊天", 400);
        Object temperatureValue = settings.opt("temperature");
        if (!(temperatureValue instanceof Number)) throw new GatewayException("温度设置格式不正确", 400);
        double temperature = ((Number) temperatureValue).doubleValue();
        if (Double.isNaN(temperature) || Double.isInfinite(temperature) || temperature < 0 || temperature > 2) throw new GatewayException("温度必须介于 0 和 2 之间", 400);
        if (settings.has("remember") && !(settings.opt("remember") instanceof Boolean)) throw new GatewayException("上下文设置格式不正确", 400);
        return new Settings(base, apiKey, model, temperature, mimo);
    }

    static JSONArray validateMessages(JSONObject body) throws GatewayException, JSONException {
        Object value = body.opt("messages");
        if (!(value instanceof JSONArray)) throw new GatewayException("聊天消息格式不正确", 400);
        JSONArray messages = (JSONArray) value;
        if (messages.length() < 2 || messages.length() > 10) throw new GatewayException("聊天必须包含系统设定和有界的近期消息，最多 10 条", 400);
        JSONArray sanitized = new JSONArray();
        int totalCharacters = 0;
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message == null) throw new GatewayException("聊天消息格式不正确", 400);
            String role = requiredString(message, "role", 20);
            if (i == 0 ? !"system".equals(role) : (!"user".equals(role) && !"assistant".equals(role))) {
                throw new GatewayException("聊天消息角色或系统设定位置不正确", 400);
            }
            int limit = "user".equals(role) ? 4000 : "system".equals(role) ? 12_000 : 20_000;
            Object contentValue = message.opt("content");
            if (!(contentValue instanceof String)) throw new GatewayException("聊天正文必须为文本", 400);
            String content = (String) contentValue;
            if (content.trim().isEmpty() || content.length() > limit || content.indexOf('\u0000') >= 0) {
                throw new GatewayException("聊天正文为空或超过允许长度", 400);
            }
            totalCharacters += content.length();
            if (totalCharacters > 32_000) throw new GatewayException("聊天上下文超过允许长度", 400);
            if (i == messages.length() - 1 && !"user".equals(role)) throw new GatewayException("最后一条消息必须来自用户", 400);
            sanitized.put(new JSONObject().put("role", role).put("content", content));
        }
        return sanitized;
    }

    private static JSONObject requiredObject(JSONObject value, String field) throws GatewayException {
        Object object = value.opt(field);
        if (!(object instanceof JSONObject)) throw new GatewayException(field + " 格式不正确", 400);
        return (JSONObject) object;
    }

    private static String requiredString(JSONObject value, String field, int max) throws GatewayException {
        Object object = value.opt(field);
        if (!(object instanceof String)) throw new GatewayException(field + " 格式不正确", 400);
        String text = ((String) object).trim();
        if (text.isEmpty() || text.length() > max || hasControl(text)) throw new GatewayException(field + " 为空或格式不正确", 400);
        return text;
    }

    private static boolean hasControl(String value) {
        for (int i = 0; i < value.length(); i++) if (value.charAt(i) < 32 || value.charAt(i) == 127) return true;
        return false;
    }

    private static String requestId(PluginCall call) throws GatewayException {
        Object value = call.getData().opt("id");
        if (!(value instanceof String) || !REQUEST_ID.matcher((String) value).matches()) throw new GatewayException("请求 ID 格式不正确", 400);
        return (String) value;
    }

    private static String finishReason(JSONObject choice) throws GatewayException {
        Object value = choice.opt("finish_reason");
        if (value == null || value == JSONObject.NULL) return null;
        if (!(value instanceof String)) throw new GatewayException("模型返回了无效的终止标记", 502);
        return ((String) value).isEmpty() ? null : (String) value;
    }

    static void requireFinishReason(String reason) throws GatewayException {
        if (reason == null || "stop".equals(reason)) return;
        String message;
        switch (reason) {
            case "length": message = "模型达到输出长度限制，回复可能不完整；请重试或要求简短回复"; break;
            case "content_filter": message = "模型服务因内容规则停止了回复，请调整消息后重试"; break;
            case "tool_calls":
            case "function_call": message = "模型尝试调用当前聊天不支持的工具，请切换模型后重试"; break;
            default: message = "模型未正常完成回复，请切换模型或稍后重试";
        }
        throw new GatewayException(message, 502);
    }

    private static boolean hasToolCalls(JSONObject value) {
        Object calls = value.opt("tool_calls");
        boolean hasCalls = calls instanceof JSONArray ? ((JSONArray) calls).length() > 0 : calls != null && calls != JSONObject.NULL;
        return hasCalls || (value.has("function_call") && !value.isNull("function_call"));
    }

    private static String upstreamDetail(JSONObject body) {
        Object error = body.opt("error");
        if (error instanceof String) return (String) error;
        if (error instanceof JSONObject && ((JSONObject) error).opt("message") instanceof String) return ((JSONObject) error).optString("message");
        if (body.opt("message") instanceof String) return body.optString("message");
        return "";
    }

    static String scrub(String message, String apiKey) {
        String safe = message == null || message.isEmpty() ? "模型服务请求失败，请稍后重试" : message;
        if (apiKey != null && !apiKey.isEmpty()) safe = safe.replace(apiKey, "[已隐藏密钥]");
        safe = safe.replaceAll("(?i)Bearer\\s+[^\\s\"',;]+", "Bearer [已隐藏密钥]");
        safe = KEY_IN_ERROR.matcher(safe).replaceAll("[已隐藏密钥]");
        safe = safe.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "");
        return safe.substring(0, Math.min(safe.length(), 280));
    }

    private static GatewayException classify(Exception error, String apiKey) {
        if (error instanceof GatewayException) return new GatewayException(scrub(error.getMessage(), apiKey), ((GatewayException) error).status);
        if (error instanceof SocketTimeoutException) return new GatewayException("连接或读取超时，请检查网络或重试", 504);
        if (error instanceof JSONException) return new GatewayException("模型服务返回了无法解析的数据", 502);
        if (error instanceof IOException) return new GatewayException("无法连接模型服务，请检查网络后重试", 502);
        return new GatewayException("模型服务请求失败，请稍后重试", 502);
    }

    private void succeed(Operation operation, JSONObject body) {
        if (!operation.terminal.compareAndSet(false, true)) return;
        release(operation);
        if (operation.call != null) operation.call.resolve(response(200, body));
    }

    private void fail(Operation operation, GatewayException error) {
        if (!operation.terminal.compareAndSet(false, true)) return;
        release(operation);
        String message = scrub(error.getMessage(), operation.settings.apiKey);
        if (operation.streaming) emit(operation, event(operation.id, "error").put("message", message));
        else if (operation.call != null) operation.call.resolve(response(error.status, errorBody(message)));
        Future<?> work = operation.work;
        if (work != null) work.cancel(true);
        // Deliver the terminal result before a platform socket close can block.
        operation.disconnect();
    }

    private void cancelOperation(Operation operation) {
        operation.cancelled.set(true);
        if (operation.terminal.compareAndSet(false, true)) {
            release(operation);
            if (operation.call != null) operation.call.resolve(response(499, errorBody("请求已取消")));
        }
        Future<?> work = operation.work;
        if (work != null) work.cancel(true);
        operation.disconnect();
    }

    private void release(Operation operation) {
        operations.remove(operation.id, operation);
        if (operation.firstDeadline != null) operation.firstDeadline.cancel(false);
        if (operation.totalDeadline != null) operation.totalDeadline.cancel(false);
    }

    private void emit(Operation operation, JSObject event) {
        if (operation != null) {
            synchronized (operation) {
                // Serialize queue insertion against a terminal notification on another thread.
                if ("delta".equals(event.optString("type")) && operation.terminal.get()) return;
                queueEvent(operation, event);
            }
        } else queueEvent(null, event);
    }

    private void queueEvent(Operation operation, JSObject event) {
        main.post(() -> {
            // Already-enqueued deltas precede the terminal event; only explicit cancellation drops them.
            if (!destroyed.get() && (operation == null || !operation.cancelled.get())) notifyListeners("event", event);
        });
    }

    private static JSObject event(String id, String type) {
        return new JSObject().put("id", id).put("type", type);
    }

    private static JSObject response(int status, JSONObject body) {
        return new JSObject().put("status", status).put("body", body);
    }

    private static JSObject errorBody(String message) {
        return new JSObject().put("error", message);
    }

    static class GatewayException extends Exception {
        final int status;
        GatewayException(String message, int status) { super(message); this.status = status; }
    }

    static class Settings {
        final String baseUrl;
        final String apiKey;
        final String model;
        final double temperature;
        final boolean mimo;
        Settings(String baseUrl, String apiKey, String model, double temperature, boolean mimo) {
            this.baseUrl = baseUrl; this.apiKey = apiKey; this.model = model;
            this.temperature = temperature; this.mimo = mimo;
        }
    }

    private static class Operation {
        final String id;
        final Settings settings;
        final boolean streaming;
        final PluginCall call;
        final long started = SystemClock.elapsedRealtime();
        final AtomicBoolean terminal = new AtomicBoolean(false);
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        volatile long firstTokenMs = -1;
        volatile Future<?> work;
        volatile ScheduledFuture<?> firstDeadline;
        volatile ScheduledFuture<?> totalDeadline;
        private HttpURLConnection connection;
        Operation(String id, Settings settings, boolean streaming, PluginCall call) {
            this.id = id; this.settings = settings; this.streaming = streaming; this.call = call;
        }
        long elapsed() { return SystemClock.elapsedRealtime() - started; }
        void requireActive() throws GatewayException {
            if (terminal.get() || cancelled.get() || Thread.currentThread().isInterrupted()) throw new GatewayException("请求已取消", 499);
        }
        synchronized void attach(HttpURLConnection connection) throws GatewayException {
            if (terminal.get() || cancelled.get()) { connection.disconnect(); throw new GatewayException("请求已取消", 499); }
            this.connection = connection;
        }
        void disconnect() {
            HttpURLConnection current;
            synchronized (this) { current = connection; connection = null; }
            if (current != null) current.disconnect();
        }
    }

    private static class SseState {
        final StringBuilder line = new StringBuilder();
        final StringBuilder data = new StringBuilder();
        boolean hasData;
        boolean atStart = true;
        boolean previousCarriageReturn;
        boolean finished;
        int outputCharacters;
        int receivedCharacters;
    }

    static class CompletionChunk {
        final String text;
        final boolean finished;
        final String finishReason;
        CompletionChunk(String text, boolean finished, String finishReason) {
            this.text = text; this.finished = finished; this.finishReason = finishReason;
        }
    }
}
