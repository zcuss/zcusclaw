import { html, nothing } from "lit";
import type { ChannelAccountSnapshot, ChannelUiMetaEntry } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";

type ConfigureChannelsProps = ChannelsProps & {
  activeChannelId: string | null;
  onActiveChannelChange: (channelId: string) => void;
  onConfigRemove: (path: Array<string | number>) => void;
};

const selectedAccountByChannel = new Map<string, string>();

type ChannelAccountConfig = Record<string, unknown>;

type ChannelAccountEntry = {
  accountId: string;
  label: string;
  config: ChannelAccountConfig;
  snapshot: ChannelAccountSnapshot | null;
  isDefault: boolean;
  hasConfig: boolean;
};

type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "password" | "checkbox";
  placeholder?: string;
};

const DEFAULT_CHANNELS: ChannelUiMetaEntry[] = [
  { id: "whatsapp", label: "WhatsApp", detailLabel: "WhatsApp" },
  { id: "telegram", label: "Telegram", detailLabel: "Telegram" },
  { id: "discord", label: "Discord", detailLabel: "Discord" },
  { id: "slack", label: "Slack", detailLabel: "Slack" },
  { id: "signal", label: "Signal", detailLabel: "Signal" },
  { id: "imessage", label: "iMessage", detailLabel: "iMessage" },
  { id: "googlechat", label: "Google Chat", detailLabel: "Google Chat" },
  { id: "nostr", label: "Nostr", detailLabel: "Nostr" },
];

const channelAddDrafts = new Map<string, string>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveChannelsConfig(
  configForm: Record<string, unknown> | null,
): Record<string, unknown> {
  return asRecord(configForm?.channels) ?? {};
}

function resolveChannelConfig(
  configForm: Record<string, unknown> | null,
  channelId: string,
): ChannelAccountConfig {
  return asRecord(resolveChannelsConfig(configForm)[channelId]) ?? {};
}

function resolveChannelMeta(props: ConfigureChannelsProps): ChannelUiMetaEntry[] {
  const byId = new Map<string, ChannelUiMetaEntry>();
  for (const entry of DEFAULT_CHANNELS) {
    byId.set(entry.id, entry);
  }
  for (const entry of props.snapshot?.channelMeta ?? []) {
    byId.set(entry.id, entry);
  }
  for (const [id, label] of Object.entries(props.snapshot?.channelLabels ?? {})) {
    byId.set(id, byId.get(id) ?? { id, label, detailLabel: label });
  }
  for (const id of Object.keys(resolveChannelsConfig(props.configForm))) {
    byId.set(id, byId.get(id) ?? { id, label: id, detailLabel: id });
  }
  const orderedIds = [
    ...(props.snapshot?.channelMeta?.map((entry) => entry.id) ?? []),
    ...(props.snapshot?.channelOrder ?? []),
    ...DEFAULT_CHANNELS.map((entry) => entry.id),
    ...Object.keys(resolveChannelsConfig(props.configForm)),
  ];
  const seen = new Set<string>();
  return orderedIds
    .filter((id) => {
      if (seen.has(id) || !byId.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    })
    .map((id) => byId.get(id)!);
}

function resolveAccountEntries(
  props: ConfigureChannelsProps,
  channelId: string,
): ChannelAccountEntry[] {
  const channelConfig = resolveChannelConfig(props.configForm, channelId);
  const configuredAccounts = asRecord(channelConfig.accounts) ?? {};
  const snapshots = props.snapshot?.channelAccounts?.[channelId] ?? [];
  const ids = new Set<string>(["default"]);
  for (const id of Object.keys(configuredAccounts)) {
    ids.add(id);
  }
  for (const account of snapshots) {
    ids.add(account.accountId);
  }
  return [...ids].map((accountId) => {
    const snapshot = snapshots.find((account) => account.accountId === accountId) ?? null;
    const configured = asRecord(configuredAccounts[accountId]);
    const isDefault = accountId === "default";
    const config = isDefault ? channelConfig : (configured ?? {});
    const name = typeof config.name === "string" ? config.name : snapshot?.name;
    return {
      accountId,
      label: name?.trim() || (isDefault ? "default (primary)" : accountId),
      config,
      snapshot,
      isDefault,
      hasConfig: isDefault
        ? Object.keys(channelConfig).some((key) => key !== "accounts")
        : Boolean(configured),
    };
  });
}

function fieldSpecsForChannel(channelId: string): FieldSpec[] {
  const common: FieldSpec[] = [
    { key: "name", label: "Name", placeholder: "Personal bot / Work phone" },
    { key: "enabled", label: "Enabled", type: "checkbox" },
  ];
  switch (channelId) {
    case "whatsapp":
      return common;
    case "telegram":
      return [
        ...common,
        { key: "botToken", label: "Bot token", type: "password", placeholder: "123456:ABC..." },
        {
          key: "tokenFile",
          label: "Token file",
          placeholder: "~/.zcusclaw/credentials/telegram-token",
        },
      ];
    case "discord":
      return [
        ...common,
        { key: "token", label: "Bot token", type: "password", placeholder: "Discord bot token" },
        {
          key: "applicationId",
          label: "Application ID",
          placeholder: "Optional Discord application/client ID",
        },
      ];
    case "slack":
      return [
        ...common,
        { key: "botToken", label: "Bot token", type: "password", placeholder: "xoxb-..." },
        { key: "appToken", label: "App token", type: "password", placeholder: "xapp-..." },
        { key: "signingSecret", label: "Signing secret", type: "password" },
      ];
    case "signal":
      return [
        ...common,
        { key: "account", label: "Phone/account", placeholder: "+15555550123" },
        { key: "httpUrl", label: "signal-cli REST URL", placeholder: "http://127.0.0.1:8080" },
      ];
    case "googlechat":
      return [
        ...common,
        { key: "serviceAccountFile", label: "Service account file" },
        { key: "webhookPath", label: "Webhook path" },
      ];
    case "imessage":
      return [
        ...common,
        { key: "cliPath", label: "CLI path" },
        { key: "dbPath", label: "Database path" },
      ];
    default:
      return common;
  }
}

function accountPath(channelId: string, accountId: string): Array<string | number> {
  return accountId === "default"
    ? ["channels", channelId]
    : ["channels", channelId, "accounts", accountId];
}

function renderField(params: {
  props: ConfigureChannelsProps;
  channelId: string;
  account: ChannelAccountEntry;
  field: FieldSpec;
}) {
  const value = params.account.config[params.field.key];
  const path = [...accountPath(params.channelId, params.account.accountId), params.field.key];
  if (params.field.type === "checkbox") {
    return html`
      <label class="qs-row" style="cursor: pointer;">
        <span>
          <span class="qs-row__label">${params.field.label}</span>
          <span class="qs-row__hint"
            >${params.account.snapshot?.running ? "Running" : "Toggle account config"}</span
          >
        </span>
        <span class="qs-toggle">
          <input
            type="checkbox"
            .checked=${value !== false}
            ?disabled=${params.props.configSaving || params.props.configSchemaLoading}
            @change=${(event: Event) =>
              params.props.onConfigPatch(path, (event.target as HTMLInputElement).checked)}
          />
          <span class="qs-toggle__track" aria-hidden="true"></span>
        </span>
      </label>
    `;
  }
  return html`
    <label class="field">
      <span>${params.field.label}</span>
      <input
        type=${params.field.type === "password" ? "password" : "text"}
        autocomplete="off"
        placeholder=${params.field.placeholder ?? ""}
        .value=${typeof value === "string" ? value : ""}
        ?disabled=${params.props.configSaving || params.props.configSchemaLoading}
        @input=${(event: Event) =>
          params.props.onConfigPatch(path, (event.target as HTMLInputElement).value)}
      />
    </label>
  `;
}

function resolveSelectedAccountId(channelId: string, accounts: ChannelAccountEntry[]): string {
  const current = selectedAccountByChannel.get(channelId);
  if (current && accounts.some((account) => account.accountId === current)) {
    return current;
  }
  const preferred =
    accounts.find((account) => account.hasConfig)?.accountId ?? accounts[0]?.accountId ?? "default";
  selectedAccountByChannel.set(channelId, preferred);
  return preferred;
}

function renderAccountSelector(params: {
  props: ConfigureChannelsProps;
  channelId: string;
  accounts: ChannelAccountEntry[];
}) {
  const { props, channelId, accounts } = params;
  const selectedAccountId = resolveSelectedAccountId(channelId, accounts);
  return html`
    <section class="card" style="margin-top: 12px;">
      <div class="card-title">Account</div>
      <div class="card-sub">
        Pilih account dari dropdown, nanti form detail muncul di bawah buat auth, pairing,
        allowlist, blocklist, dan setting lain yang tersedia.
      </div>
      <label class="field" style="margin-top: 12px;">
        <span>Selected account</span>
        <select
          ?disabled=${props.configSaving || props.configSchemaLoading}
          @change=${(event: Event) => {
            selectedAccountByChannel.set(channelId, (event.target as HTMLSelectElement).value);
            props.onActiveChannelChange(channelId);
          }}
        >
          ${accounts.map(
            (account) => html`
              <option
                value=${account.accountId}
                ?selected=${account.accountId === selectedAccountId}
              >
                ${account.label} —
                ${channelId}/${account.accountId}${account.snapshot?.connected
                  ? " · connected"
                  : account.snapshot?.configured
                    ? " · configured"
                    : account.hasConfig
                      ? " · config"
                      : " · empty"}
              </option>
            `,
          )}
        </select>
      </label>
    </section>
  `;
}

function renderAccountForm(params: {
  props: ConfigureChannelsProps;
  channelId: string;
  account: ChannelAccountEntry;
}) {
  const { props, channelId, account } = params;
  return html`
    <section class="card" style="margin-top: 12px;">
      <div class="row" style="justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div>
          <div class="card-title">Edit account: ${account.label}</div>
          <div class="card-sub">${channelId}/${account.accountId}</div>
        </div>
        <button
          class="btn danger btn--sm"
          ?disabled=${props.configSaving || props.configSchemaLoading || !account.hasConfig}
          @click=${() => {
            if (selectedAccountByChannel.get(channelId) === account.accountId) {
              selectedAccountByChannel.delete(channelId);
            }
            props.onConfigRemove(accountPath(channelId, account.accountId));
            props.onActiveChannelChange(channelId);
          }}
        >
          Delete account
        </button>
      </div>
      <div class="config-form" style="margin-top: 12px;">
        ${fieldSpecsForChannel(channelId).map((field) =>
          renderField({ props, channelId, account, field }),
        )}
      </div>
      <div
        class="row"
        style="margin-top: 12px; justify-content: flex-end; gap: 8px; flex-wrap: wrap;"
      >
        <button
          class="btn primary"
          ?disabled=${props.configSaving || !props.configFormDirty}
          @click=${() => props.onConfigSave()}
        >
          ${props.configSaving ? "Saving…" : `Save ${account.label}`}
        </button>
      </div>
    </section>
  `;
}

function renderAddAccount(props: ConfigureChannelsProps, channelId: string) {
  const draft = channelAddDrafts.get(channelId) ?? "";
  const inputId = `channel-add-account-${channelId}`;
  return html`
    <section class="card" style="margin-top: 12px;">
      <div class="card-title">Add account</div>
      <div class="card-sub">
        Kosongkan untuk primary/default. Isi nama pendek untuk akun tambahan.
      </div>
      <div class="row" style="margin-top: 12px; gap: 10px; align-items: end; flex-wrap: wrap;">
        <label class="field" style="min-width: 220px; flex: 1;">
          <span>Account id</span>
          <input
            id=${inputId}
            placeholder="default / work / personal"
            .value=${draft}
            ?disabled=${props.configSaving || props.configSchemaLoading}
            @input=${(event: Event) =>
              channelAddDrafts.set(channelId, (event.target as HTMLInputElement).value)}
          />
        </label>
        <button
          class="btn"
          ?disabled=${props.configSaving || props.configSchemaLoading}
          @click=${(event: Event) => {
            const root = (event.currentTarget as HTMLElement).getRootNode();
            const input = root.querySelector(`#${inputId}`) as HTMLInputElement | null;
            const nextAccountId =
              input?.value.trim() || channelAddDrafts.get(channelId)?.trim() || "default";
            props.onConfigPatch(accountPath(channelId, nextAccountId), { enabled: true });
            selectedAccountByChannel.set(channelId, nextAccountId);
            channelAddDrafts.set(channelId, "");
            if (input) {
              input.value = "";
            }
            props.onActiveChannelChange(channelId);
          }}
        >
          Add
        </button>
      </div>
    </section>
  `;
}

function normalizeWhatsAppUiMessage(message: string | null): {
  text: string | null;
  providerUnavailable: boolean;
} {
  if (!message) {
    return { text: null, providerUnavailable: false };
  }
  if (message.includes("web login provider is not available")) {
    return {
      text: "WhatsApp Web login belum tersedia di gateway yang lagi jalan. Pastikan plugin/provider WhatsApp aktif, lalu restart gateway sebelum scan QR.",
      providerUnavailable: true,
    };
  }
  return { text: message, providerUnavailable: false };
}

function renderWhatsAppActions(props: ConfigureChannelsProps) {
  const linked = props.whatsappConnected === true;
  const message = normalizeWhatsAppUiMessage(props.whatsappMessage);
  return html`
    <section class="card" style="margin-top: 12px;">
      <div class="card-title">WhatsApp link</div>
      <div class="card-sub">Scan QR, relink, logout, atau refresh status dari sini.</div>
      ${message.text
        ? html`<div class="callout" style="margin-top: 12px;">${message.text}</div>`
        : nothing}
      ${props.whatsappQrDataUrl
        ? html`<div class="qr-wrap"><img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" /></div>`
        : nothing}
      <div class="row" style="margin-top: 12px; gap: 10px; flex-wrap: wrap;">
        <button
          class="btn primary"
          ?disabled=${props.whatsappBusy || message.providerUnavailable}
          @click=${() => props.onWhatsAppStart(linked)}
        >
          ${linked ? "Relink" : "Show QR"}
        </button>
        ${props.whatsappQrDataUrl
          ? html`<button
              class="btn"
              ?disabled=${props.whatsappBusy || message.providerUnavailable}
              @click=${() => props.onWhatsAppWait()}
            >
              Wait for scan
            </button>`
          : nothing}
        <button
          class="btn danger"
          ?disabled=${props.whatsappBusy || message.providerUnavailable}
          @click=${() => props.onWhatsAppLogout()}
        >
          Logout
        </button>
        <button class="btn" @click=${() => props.onRefresh(true)}>Refresh</button>
      </div>
    </section>
  `;
}

export function renderConfigureChannels(props: ConfigureChannelsProps) {
  const channelMeta = resolveChannelMeta(props);
  const activeChannel =
    channelMeta.find((entry) => entry.id === props.activeChannelId) ?? channelMeta[0] ?? null;
  if (!activeChannel) {
    return html`<section class="card"><div class="card-title">No channels found</div></section>`;
  }
  const accounts = resolveAccountEntries(props, activeChannel.id);
  const selectedAccountId = resolveSelectedAccountId(activeChannel.id, accounts);
  const selectedAccount =
    accounts.find((account) => account.accountId === selectedAccountId) ?? accounts[0] ?? null;
  return html`
    <section class="card" style="margin-top: 16px;">
      <div class="row" style="justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div>
          <div class="card-title">Channels</div>
          <div class="card-sub">
            Pilih channel, tambah akun, pilih account dari dropdown, edit field penting, lalu Save.
          </div>
        </div>
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          <button class="btn" @click=${() => props.onRefresh(true)}>Refresh</button>
          <button
            class="btn primary"
            ?disabled=${props.configSaving || !props.configFormDirty}
            @click=${() => props.onConfigSave()}
          >
            ${props.configSaving ? "Saving…" : "Save all changes"}
          </button>
        </div>
      </div>
      ${props.lastError
        ? html`<div class="callout danger" style="margin-top: 12px;">${props.lastError}</div>`
        : nothing}
      <div class="qs-list" style="margin-top: 14px;">
        ${channelMeta.map(
          (entry) => html`
            <button
              class="qs-list-item ${entry.id === activeChannel.id ? "qs-list-item--active" : ""}"
              @click=${() => props.onActiveChannelChange(entry.id)}
            >
              <span class="qs-list-item__body">
                <span class="qs-list-item__label">${entry.label}</span>
                <span class="qs-list-item__hint">
                  ${resolveAccountEntries(props, entry.id).filter((account) => account.hasConfig)
                    .length}
                  account config
                </span>
              </span>
            </button>
          `,
        )}
      </div>
    </section>

    ${activeChannel.id === "whatsapp" ? renderWhatsAppActions(props) : nothing}
    ${renderAddAccount(props, activeChannel.id)}
    ${renderAccountSelector({
      props,
      channelId: activeChannel.id,
      accounts,
    })}
    ${selectedAccount
      ? renderAccountForm({ props, channelId: activeChannel.id, account: selectedAccount })
      : nothing}
  `;
}
