import { useState, type FormEvent } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  AVATARS,
  COLORS,
  DEFAULT_DRAFT,
  GENDERS,
  PERSONALITIES,
  STAGES,
} from '../../shared/catalog';
import type { CompanionDraft } from '../../shared/types';
import { draftSchema, validationError } from '../lib/validation';
import Avatar from './Avatar';
import Dialog from './Dialog';

interface Props {
  initial?: CompanionDraft;
  onClose: () => void;
  onSave: (draft: CompanionDraft) => void;
}

export default function CompanionForm({ initial, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CompanionDraft>(() => ({
    ...(initial ?? DEFAULT_DRAFT),
    personalityIds: [...(initial ?? DEFAULT_DRAFT).personalityIds],
  }));
  const [error, setError] = useState('');
  const update = <K extends keyof CompanionDraft>(key: K, value: CompanionDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const togglePersonality = (id: string) => {
    if (draft.personalityIds.includes(id)) {
      if (draft.personalityIds.length === 1) return;
      update(
        'personalityIds',
        draft.personalityIds.filter((item) => item !== id),
      );
    } else if (draft.personalityIds.length < 3)
      update('personalityIds', [...draft.personalityIds, id]);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError('给这位新朋友起个名字吧。');
      return;
    }
    if ((draft.gender === 'animal' || draft.userGender === 'animal') && !draft.animalType.trim()) {
      setError('请填写动物种类，比如猫、狐狸或金毛。');
      return;
    }
    const result = draftSchema.safeParse(draft);
    if (!result.success) {
      setError(validationError(result.error));
      return;
    }
    setError('');
    onSave(result.data);
  };

  return (
    <Dialog
      title={initial ? '编辑陪伴对象' : '认识一位新朋友'}
      description="设定一点个性，留给相处更多可能。"
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="companion-form">
        <div className="dialog-body">
          <div className="identity-picker">
            <Avatar emoji={draft.avatar} color={draft.color} size="large" />
            <label className="field flex-field">
              <span>
                怎么称呼 TA <span className="required">*</span>
              </span>
              <input
                autoComplete="off"
                maxLength={20}
                value={draft.name}
                placeholder="例如：小满"
                onChange={(event) => update('name', event.target.value)}
                required
              />
            </label>
          </div>
          <fieldset className="form-section">
            <legend>选择一个头像</legend>
            <div className="avatar-options">
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`avatar-option ${draft.avatar === emoji ? 'selected' : ''}`}
                  aria-label={`头像 ${emoji}`}
                  aria-pressed={draft.avatar === emoji}
                  onClick={() => update('avatar', emoji)}
                >
                  {emoji}
                </button>
              ))}
              <span className="avatar-divider" />
              <div className="color-options">
                {COLORS.map((color, index) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-option avatar-${color} ${draft.color === color ? 'selected' : ''}`}
                    aria-label={`头像颜色 ${['玫瑰', '鼠尾草', '薰衣草', '蜜桃', '天空', '奶茶'][index]}`}
                    aria-pressed={draft.color === color}
                    onClick={() => update('color', color)}
                  >
                    {draft.color === color && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>
          <div className="form-two-columns">
            <label className="field">
              <span>你的性别</span>
              <select
                value={draft.userGender}
                onChange={(event) =>
                  update('userGender', event.target.value as CompanionDraft['userGender'])
                }
              >
                {GENDERS.map((gender) => (
                  <option key={gender.id} value={gender.id}>
                    {gender.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>TA 的性别</span>
              <select
                value={draft.gender}
                onChange={(event) =>
                  update('gender', event.target.value as CompanionDraft['gender'])
                }
              >
                {GENDERS.map((gender) => (
                  <option key={gender.id} value={gender.id}>
                    {gender.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(draft.gender === 'animal' || draft.userGender === 'animal') && (
            <label className="field animal-field">
              <span>
                动物种类 <span className="required">*</span>
              </span>
              <input
                value={draft.animalType}
                maxLength={30}
                required
                placeholder="例如：猫、狐狸、金毛"
                onChange={(event) => update('animalType', event.target.value)}
              />
              <small>以会说话的动物伙伴相处；双方种类不同，可在补充说明中写明。</small>
            </label>
          )}
          <fieldset className="form-section">
            <legend>
              TA 的个性 <span className="legend-note">选 1–3 项，第一项为主要个性</span>
            </legend>
            <div className="personality-options">
              {PERSONALITIES.map((personality) => {
                const selected = draft.personalityIds.includes(personality.id);
                const index = draft.personalityIds.indexOf(personality.id);
                return (
                  <button
                    type="button"
                    key={personality.id}
                    className={`personality-option ${selected ? 'selected' : ''}`}
                    title={personality.description}
                    aria-pressed={selected}
                    disabled={!selected && draft.personalityIds.length >= 3}
                    onClick={() => togglePersonality(personality.id)}
                  >
                    <span>{personality.emoji}</span>
                    {personality.label}
                    {selected && <span className="selection-order">{index + 1}</span>}
                  </button>
                );
              })}
            </div>
            <p className="field-note">
              {draft.personalityIds
                .map((id) => PERSONALITIES.find((item) => item.id === id)?.description)
                .join(' · ')}
            </p>
          </fieldset>
          <fieldset className="form-section">
            <legend>你们现在的关系</legend>
            <div className="stage-options">
              {STAGES.map((stage) => (
                <button
                  type="button"
                  key={stage.id}
                  className={`stage-option ${draft.stage === stage.id ? 'selected' : ''}`}
                  aria-pressed={draft.stage === stage.id}
                  onClick={() => update('stage', stage.id)}
                >
                  <span>{stage.label}</span>
                  <small>{stage.description}</small>
                  {draft.stage === stage.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>
              再多说一点 <span className="legend-note">选填</span>
              <span className="character-count">{draft.background.length}/600</span>
            </span>
            <textarea
              value={draft.background}
              maxLength={600}
              rows={3}
              placeholder="比如：喜欢散步和独立音乐。希望你在我累的时候听我说话，不要急着给建议。"
              onChange={(event) => update('background', event.target.value)}
            />
            <small>
              写下兴趣、聊天偏好和相处边界。设定需要合理，不支持覆盖系统规则或强迫依赖。
            </small>
          </label>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <span className="dialog-footer-note">
            <Sparkles size={14} /> 每一段相处，都由你定义
          </span>
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" type="submit">
            {initial ? '保存设定' : '开始认识 TA'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
