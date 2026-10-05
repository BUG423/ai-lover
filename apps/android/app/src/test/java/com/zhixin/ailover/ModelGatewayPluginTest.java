package com.zhixin.ailover;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.*;

/** No real account, secret, or network is used in these native transport regressions. */
public class ModelGatewayPluginTest {
    private static final String PLAN_KEY = "tp-synthetic-unit-test";
    private static final String API_KEY = "sk-synthetic-unit-test";

    private JSONObject settings(String provider, String base, String key) throws Exception {
        return new JSONObject().put("settings", new JSONObject()
            .put("provider", provider).put("baseUrl", base).put("apiKey", key)
            .put("model", "mimo-v2.6-flash").put("temperature", 0.8).put("remember", true));
    }

    private JSONArray messages() throws Exception {
        return new JSONArray()
            .put(new JSONObject().put("role", "system").put("content", "虚构角色设定"))
            .put(new JSONObject().put("role", "user").put("content", "今天有点累"));
    }

    @Test
    public void providerWhitelistRejectsLookalikesRedirectsAndEmbeddedCredentials() throws Exception {
        String[] untrusted = {
            "https://token-plan-cn.xiaomimimo.com.evil.example/v1",
            "https://token-plan-cn.xiaomimimo.com@evil.example/v1",
            "https://token-plan-cn.xiaomimimo.com/v1?redirect=https://evil.example",
            "https://token-plan-cn.xiaomimimo.com/v1/../v1",
            "http://token-plan-cn.xiaomimimo.com/v1",
            "https://api.siliconflow.cn/v1"
        };
        for (String base : untrusted) {
            ModelGatewayPlugin.GatewayException error = assertThrows(
                ModelGatewayPlugin.GatewayException.class,
                () -> ModelGatewayPlugin.validateSettings(settings("mimo", base, PLAN_KEY))
            );
            assertEquals(400, error.status);
            assertFalse(error.getMessage().contains(PLAN_KEY));
        }
    }

    @Test
    public void keyTypeIsBoundToProviderAndAccountTypeBeforeNetworkAccess() throws Exception {
        ModelGatewayPlugin.validateSettings(settings("mimo", "https://token-plan-cn.xiaomimimo.com/v1", PLAN_KEY));
        ModelGatewayPlugin.validateSettings(settings("mimo", "https://token-plan-sgp.xiaomimimo.com/v1", "ttp-synthetic-team"));
        ModelGatewayPlugin.validateSettings(settings("mimo", "https://token-plan-ams.xiaomimimo.com/v1", PLAN_KEY));
        ModelGatewayPlugin.validateSettings(settings("mimo", "https://api.xiaomimimo.com/v1", API_KEY));
        ModelGatewayPlugin.validateSettings(settings("siliconflow", "https://api.siliconflow.cn/v1", API_KEY));
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.validateSettings(settings("mimo", "https://api.xiaomimimo.com/v1", PLAN_KEY)));
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.validateSettings(settings("mimo", "https://token-plan-cn.xiaomimimo.com/v1", API_KEY)));
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.validateSettings(settings("siliconflow", "https://api.siliconflow.cn/v1", PLAN_KEY)));
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.validateSettings(settings("siliconflow-international", "https://api.siliconflow.cn/v1", API_KEY)));
    }

    @Test
    public void internationalSiliconFlowNeverReceivesAnyKey() throws Exception {
        for (String provider : new String[] {"siliconflow", "siliconflow-international", "mimo"}) {
            ModelGatewayPlugin.GatewayException error = assertThrows(ModelGatewayPlugin.GatewayException.class,
                () -> ModelGatewayPlugin.validateSettings(settings(provider, "https://api.siliconflow.com/v1", API_KEY)));
            assertEquals(400, error.status);
            assertFalse(error.getMessage().contains(API_KEY));
        }
    }

    @Test
    public void unsafeHeadersAndSpeechOnlyModelsAreRejected() throws Exception {
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.validateSettings(settings("mimo", "https://api.xiaomimimo.com/v1", "sk-one\r\napi-key: two")));
        JSONObject asr = settings("mimo", "https://api.xiaomimimo.com/v1", API_KEY);
        asr.getJSONObject("settings").put("model", "mimo-v2.5-asr");
        assertThrows(ModelGatewayPlugin.GatewayException.class, () -> ModelGatewayPlugin.validateSettings(asr));
    }

    @Test
    public void messageProjectionDoesNotForwardArbitraryToolsOrCredentials() throws Exception {
        JSONArray raw = messages();
        raw.getJSONObject(1).put("apiKey", API_KEY).put("tool_calls", new JSONArray()).put("name", "attacker");
        JSONArray validated = ModelGatewayPlugin.validateMessages(new JSONObject().put("messages", raw));
        assertEquals("今天有点累", validated.getJSONObject(1).getString("content"));
        assertEquals(2, validated.getJSONObject(1).length());
        assertFalse(validated.toString().contains(API_KEY));
        assertNotSame(raw.getJSONObject(1), validated.getJSONObject(1));
    }

    @Test
    public void sharedComposerMustProvideOneLeadingSystemAndLatestUser() throws Exception {
        JSONArray misplaced = messages();
        misplaced.getJSONObject(1).put("role", "system");
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.validateMessages(new JSONObject().put("messages", misplaced)));
        JSONArray ended = messages();
        ended.getJSONObject(1).put("role", "assistant");
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.validateMessages(new JSONObject().put("messages", ended)));
        JSONArray excessive = messages();
        for (int i = 0; i < 9; i++) excessive.put(new JSONObject().put("role", "user").put("content", "额外消息"));
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.validateMessages(new JSONObject().put("messages", excessive)));
    }

    @Test
    public void reasoningAndUsageFramesCannotBecomeCompanionMessages() throws Exception {
        ModelGatewayPlugin.CompletionChunk reasoning = ModelGatewayPlugin.parseCompletionData(
            "{\"choices\":[{\"delta\":{\"reasoning_content\":\"内部推理\"},\"finish_reason\":null}]}", API_KEY);
        assertNull(reasoning.text);
        assertFalse(reasoning.finished);
        ModelGatewayPlugin.CompletionChunk visible = ModelGatewayPlugin.parseCompletionData(
            "{\"choices\":[{\"delta\":{\"content\":\"我在这里 🐱\",\"reasoning_content\":\"不能显示\"},\"finish_reason\":null}]}", API_KEY);
        assertEquals("我在这里 🐱", visible.text);
        assertFalse(visible.finished);
        ModelGatewayPlugin.CompletionChunk usage = ModelGatewayPlugin.parseCompletionData("{\"choices\":[],\"usage\":{\"total_tokens\":5}}", API_KEY);
        assertNull(usage.text);
        assertFalse(usage.finished);
    }

    @Test
    public void successfulMarkersAndAbnormalTerminationsAreDistinguished() throws Exception {
        assertTrue(ModelGatewayPlugin.parseCompletionData("[DONE]", API_KEY).finished);
        assertTrue(ModelGatewayPlugin.parseCompletionData("{\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}", API_KEY).finished);
        ModelGatewayPlugin.CompletionChunk partial = ModelGatewayPlugin.parseCompletionData(
            "{\"choices\":[{\"delta\":{\"content\":\"尚未完整\"},\"finish_reason\":\"length\"}]}", API_KEY);
        assertEquals("尚未完整", partial.text);
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.requireFinishReason(partial.finishReason));
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.parseCompletionData("{\"choices\":[{\"delta\":{\"tool_calls\":[{}]}}]}", API_KEY));
        assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.parseCompletionData("{\"choices\":[{\"delta\":{\"content\":{\"unsafe\":true}}}]}", API_KEY));
    }

    @Test
    public void upstreamErrorNeverExposesEitherKeyFormat() throws Exception {
        JSONObject error = new JSONObject().put("error", new JSONObject().put("message",
            "failed " + PLAN_KEY + " Bearer sk-another-secret " + API_KEY));
        ModelGatewayPlugin.GatewayException failure = assertThrows(ModelGatewayPlugin.GatewayException.class,
            () -> ModelGatewayPlugin.parseCompletionData(error.toString(), PLAN_KEY));
        assertFalse(failure.getMessage().contains(PLAN_KEY));
        assertFalse(failure.getMessage().contains(API_KEY));
        assertFalse(failure.getMessage().contains("sk-another-secret"));
        assertTrue(failure.getMessage().contains("已隐藏密钥"));
        assertTrue(ModelGatewayPlugin.scrub("x".repeat(500), API_KEY).length() <= 280);
    }
}
