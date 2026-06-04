import JSON5 from "json5";
import { html } from "lit";
import { t } from "../../i18n/index.ts";
import type { ConfigUiHints } from "../types.ts";
import { formatChannelExtraValue, resolveChannelConfigValue } from "./channel-config-extras.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { analyzeConfigSchema, renderNode, schemaType, type JsonSchema } from "./config-form.ts";

type ChannelConfigFormProps = {
  channelId: string;
  configValue: Record<string, unknown> | null;
  schema: unknown;
  uiHints: ConfigUiHints;
  disabled: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
};

type ChannelConfigRawEditorProps = {
  channelId: string;
  configValue: Record<string, unknown> | null;
  disabled: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
};

const channelRawDraftById = new Map<string, string>();
const channelRawErrorById = new Map<string, string>();

function resolveSchemaNode(
  schema: JsonSchema | null,
  path: Array<string | number>,
): JsonSchema | null {
  let current = schema;
  for (const key of path) {
    if (!current) {
      return null;
    }
    const type = schemaType(current);
    if (type === "object") {
      const properties = current.properties ?? {};
      if (typeof key === "string" && properties[key]) {
        current = properties[key];
        continue;
      }
      const additional = current.additionalProperties;
      if (typeof key === "string" && additional && typeof additional === "object") {
        current = additional;
        continue;
      }
      return null;
    }
    if (type === "array") {
      if (typeof key !== "number") {
        return null;
      }
      const items = Array.isArray(current.items) ? current.items[0] : current.items;
      current = items ?? null;
      continue;
    }
    return null;
  }
  return current;
}

function resolveChannelValue(
  config: Record<string, unknown>,
  channelId: string,
): Record<string, unknown> {
  return resolveChannelConfigValue(config, channelId) ?? {};
}

const EXTRA_CHANNEL_FIELDS = ["groupPolicy", "streamMode", "dmPolicy"] as const;

function renderExtraChannelFields(value: Record<string, unknown>) {
  const entries = EXTRA_CHANNEL_FIELDS.flatMap((field) => {
    if (!(field in value)) {
      return [];
    }
    return [[field, value[field]]] as Array<[string, unknown]>;
  });
  if (entries.length === 0) {
    return null;
  }
  return html`
    <div class="status-list" style="margin-top: 12px;">
      ${entries.map(
        ([field, raw]) => html`
          <div>
            <span class="label">${field}</span>
            <span>${formatChannelExtraValue(raw)}</span>
          </div>
        `,
      )}
    </div>
  `;
}

function serializeChannelRawValue(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function rawDraftMatchesValue(draft: string, value: Record<string, unknown>): boolean {
  try {
    const parsed = JSON5.parse(draft) as unknown;
    return JSON.stringify(parsed) === JSON.stringify(value);
  } catch {
    return false;
  }
}

function resolveRawDraft(channelId: string, value: Record<string, unknown>): string {
  const nextSerialized = serializeChannelRawValue(value);
  const existingDraft = channelRawDraftById.get(channelId);
  if (existingDraft && rawDraftMatchesValue(existingDraft, value)) {
    return existingDraft;
  }
  channelRawDraftById.set(channelId, nextSerialized);
  return nextSerialized;
}

function renderChannelRawEditor(props: ChannelConfigRawEditorProps) {
  const value = resolveChannelValue(props.configValue ?? {}, props.channelId);
  const rawDraft = resolveRawDraft(props.channelId, value);
  const rawError = channelRawErrorById.get(props.channelId) ?? null;
  return html`
    <div class="callout info" style="margin-bottom: 12px;">
      Schema form belum tersedia untuk channel ini. Edit object channel langsung di bawah.
    </div>
    <div class="field">
      <span>Raw channel config (JSON/JSON5)</span>
      <textarea
        placeholder="{
  enabled: true
}"
        .value=${rawDraft}
        ?disabled=${props.disabled}
        @input=${(event: Event) => {
          const next = (event.target as HTMLTextAreaElement).value;
          channelRawDraftById.set(props.channelId, next);
          try {
            const parsed = JSON5.parse(next) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
              channelRawErrorById.set(props.channelId, "Channel config harus object JSON.");
              return;
            }
            channelRawErrorById.delete(props.channelId);
            props.onPatch(["channels", props.channelId], parsed);
          } catch (error) {
            channelRawErrorById.set(props.channelId, `JSON5 tidak valid: ${String(error)}`);
          }
        }}
      ></textarea>
    </div>
    ${rawError
      ? html`<div class="callout danger" style="margin-top: 12px;">${rawError}</div>`
      : null}
    ${renderExtraChannelFields(value)}
  `;
}

export function renderChannelConfigForm(props: ChannelConfigFormProps) {
  const analysis = analyzeConfigSchema(props.schema);
  const normalized = analysis.schema;
  if (!normalized) {
    return renderChannelRawEditor(props);
  }
  const node = resolveSchemaNode(normalized, ["channels", props.channelId]);
  if (!node) {
    return renderChannelRawEditor(props);
  }
  channelRawErrorById.delete(props.channelId);
  channelRawDraftById.delete(props.channelId);
  const configValue = props.configValue ?? {};
  const value = resolveChannelValue(configValue, props.channelId);
  return html`
    <div class="config-form">
      ${renderNode({
        schema: node,
        value,
        path: ["channels", props.channelId],
        hints: props.uiHints,
        unsupported: new Set(analysis.unsupportedPaths),
        disabled: props.disabled,
        showLabel: false,
        onPatch: props.onPatch,
      })}
    </div>
    ${renderExtraChannelFields(value)}
  `;
}

export function renderChannelConfigSection(params: { channelId: string; props: ChannelsProps }) {
  const { channelId, props } = params;
  const disabled = props.configSaving || props.configSchemaLoading;
  return html`
    <div style="margin-top: 16px;">
      ${props.configSchemaLoading
        ? html` <div class="muted">Loading config schema…</div> `
        : renderChannelConfigForm({
            channelId,
            configValue: props.configForm,
            schema: props.configSchema,
            uiHints: props.configUiHints,
            disabled,
            onPatch: props.onConfigPatch,
          })}
      <div class="row channels-config-actions" style="margin-top: 12px;">
        <button
          class="btn primary"
          ?disabled=${disabled || !props.configFormDirty || channelRawErrorById.has(channelId)}
          @click=${() => props.onConfigSave()}
        >
          ${props.configSaving ? "Saving…" : "Save"}
        </button>
        <button class="btn" ?disabled=${disabled} @click=${() => props.onConfigReload()}>
          ${t("common.reload")}
        </button>
      </div>
    </div>
  `;
}
