import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { WhatsAppStatus } from "../types.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import { renderConfigureChannels } from "./channels.configure.ts";
import {
  channelEnabled,
  resolveChannelConfigured,
  resolveChannelDisplayState,
} from "./channels.shared.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { renderWhatsAppCard } from "./channels.whatsapp.ts";

function createProps(snapshot: ChannelsProps["snapshot"]): ChannelsProps {
  return {
    connected: true,
    loading: false,
    snapshot,
    lastError: null,
    lastSuccessAt: null,
    whatsappMessage: null,
    whatsappQrDataUrl: null,
    whatsappConnected: null,
    whatsappBusy: false,
    configSchema: null,
    configSchemaLoading: false,
    configForm: null,
    configUiHints: {},
    configSaving: false,
    configFormDirty: false,
    nostrProfileFormState: null,
    nostrProfileAccountId: null,
    onRefresh: () => {},
    onWhatsAppStart: () => {},
    onWhatsAppWait: () => {},
    onWhatsAppLogout: () => {},
    onConfigPatch: () => {},
    onConfigSave: () => {},
    onConfigReload: () => {},
    onNostrProfileEdit: () => {},
    onNostrProfileCancel: () => {},
    onNostrProfileFieldChange: () => {},
    onNostrProfileSave: () => {},
    onNostrProfileImport: () => {},
    onNostrProfileToggleAdvanced: () => {},
  };
}

function createWhatsAppStatus(overrides: Partial<WhatsAppStatus> = {}): WhatsAppStatus {
  return {
    configured: true,
    linked: false,
    running: false,
    connected: false,
    reconnectAttempts: 0,
    ...overrides,
  };
}

function renderWhatsAppButtons(params: {
  linked?: boolean;
  qrDataUrl?: string | null;
  onWhatsAppStart?: ChannelsProps["onWhatsAppStart"];
}) {
  const whatsapp = createWhatsAppStatus({ linked: params.linked === true });
  const props = createProps({
    ts: Date.now(),
    channelOrder: ["whatsapp"],
    channelLabels: { whatsapp: "WhatsApp" },
    channels: { whatsapp },
    channelAccounts: {},
    channelDefaultAccountId: {},
  });
  props.whatsappQrDataUrl = params.qrDataUrl ?? null;
  if (params.onWhatsAppStart) {
    props.onWhatsAppStart = params.onWhatsAppStart;
  }

  const container = document.createElement("div");
  render(renderWhatsAppCard({ props, whatsapp, accountCountLabel: null }), container);
  const buttons = Array.from(container.querySelectorAll("button"));
  return {
    buttons,
    labels: buttons.map((button) => button.textContent?.trim()),
  };
}

describe("channel display selectors", () => {
  it("returns the channel summary configured flag when present", () => {
    const props = createProps({
      ts: Date.now(),
      channelOrder: ["guildchat"],
      channelLabels: { guildchat: "Guild Chat" },
      channels: { guildchat: { configured: false } },
      channelAccounts: {
        guildchat: [{ accountId: "guild-main", configured: true }],
      },
      channelDefaultAccountId: { guildchat: "guild-main" },
    });

    expect(resolveChannelConfigured("guildchat", props)).toBe(false);
    expect(resolveChannelDisplayState("guildchat", props).configured).toBe(false);
  });

  it("falls back to the default account when the channel summary omits configured", () => {
    const props = createProps({
      ts: Date.now(),
      channelOrder: ["guildchat"],
      channelLabels: { guildchat: "Guild Chat" },
      channels: { guildchat: { running: true } },
      channelAccounts: {
        guildchat: [
          { accountId: "default", configured: false },
          { accountId: "guild-main", configured: true },
        ],
      },
      channelDefaultAccountId: { guildchat: "guild-main" },
    });

    const displayState = resolveChannelDisplayState("guildchat", props);

    expect(resolveChannelConfigured("guildchat", props)).toBe(true);
    expect(displayState.defaultAccount?.accountId).toBe("guild-main");
    expect(channelEnabled("guildchat", props)).toBe(true);
  });

  it("falls back to the first account when no default account id is available", () => {
    const props = createProps({
      ts: Date.now(),
      channelOrder: ["workspace"],
      channelLabels: { workspace: "Workspace" },
      channels: { workspace: { running: true } },
      channelAccounts: {
        workspace: [{ accountId: "workspace-a", configured: true }],
      },
      channelDefaultAccountId: {},
    });

    const displayState = resolveChannelDisplayState("workspace", props);

    expect(resolveChannelConfigured("workspace", props)).toBe(true);
    expect(displayState.defaultAccount?.accountId).toBe("workspace-a");
  });

  it("keeps disabled channels hidden when neither summary nor accounts are active", () => {
    const props = createProps({
      ts: Date.now(),
      channelOrder: ["quietchat"],
      channelLabels: { quietchat: "Quiet Chat" },
      channels: { quietchat: {} },
      channelAccounts: {
        quietchat: [{ accountId: "default", configured: false, running: false, connected: false }],
      },
      channelDefaultAccountId: { quietchat: "default" },
    });

    const displayState = resolveChannelDisplayState("quietchat", props);

    expect(displayState.configured).toBe(false);
    expect(displayState.running).toBeNull();
    expect(displayState.connected).toBeNull();
    expect(channelEnabled("quietchat", props)).toBe(false);
  });
});

describe("WhatsApp card actions", () => {
  it("shows QR as the primary action before WhatsApp is linked", () => {
    const onWhatsAppStart = vi.fn();
    const { buttons, labels } = renderWhatsAppButtons({
      linked: false,
      onWhatsAppStart,
    });

    expect(labels).toEqual(["Save", "Reload", "Show QR", "Logout", "Refresh"]);

    const showQr = buttons.find((button) => button.textContent?.trim() === "Show QR");
    expect(showQr).toBeInstanceOf(HTMLButtonElement);
    showQr!.click();
    expect(onWhatsAppStart).toHaveBeenCalledWith(false);
  });

  it("uses relink as the explicit action after WhatsApp is linked", () => {
    const onWhatsAppStart = vi.fn();
    const { buttons, labels } = renderWhatsAppButtons({
      linked: true,
      onWhatsAppStart,
    });

    expect(labels).toEqual(["Save", "Reload", "Relink", "Logout", "Refresh"]);

    const relink = buttons.find((button) => button.textContent?.trim() === "Relink");
    expect(relink).toBeInstanceOf(HTMLButtonElement);
    relink!.click();
    expect(onWhatsAppStart).toHaveBeenCalledWith(true);
  });

  it("shows wait for scan only while a QR is displayed", () => {
    const { labels } = renderWhatsAppButtons({
      linked: false,
      qrDataUrl: "data:image/png;base64,current-qr",
    });

    expect(labels).toEqual(["Save", "Reload", "Show QR", "Wait for scan", "Logout", "Refresh"]);
  });
});

describe("channel config raw fallback", () => {
  it("renders a raw textarea and patches parsed JSON5 when schema is unavailable", () => {
    const onConfigPatch = vi.fn();
    const props = createProps({
      ts: Date.now(),
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channels: { telegram: {} },
      channelAccounts: {},
      channelDefaultAccountId: {},
    });
    props.configForm = {
      channels: {
        telegram: {
          botToken: "abc",
        },
      },
    };
    props.configFormDirty = true;
    props.onConfigPatch = onConfigPatch;

    const container = document.createElement("div");
    render(renderChannelConfigSection({ channelId: "telegram", props }), container);

    const textarea = container.querySelector("textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
    textarea!.value = '{ botToken: "next-token", enabled: true }';
    textarea!.dispatchEvent(new Event("input"));

    expect(onConfigPatch).toHaveBeenCalledWith(["channels", "telegram"], {
      botToken: "next-token",
      enabled: true,
    });
  });
});

describe("configure channels form", () => {
  it("edits, adds, and deletes channel account config from a compact form", () => {
    const onConfigPatch = vi.fn();
    const onConfigRemove = vi.fn();
    const props = createProps({
      ts: Date.now(),
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channelMeta: [{ id: "telegram", label: "Telegram", detailLabel: "Telegram" }],
      channels: { telegram: { configured: true } },
      channelAccounts: {
        telegram: [{ accountId: "default", configured: true, name: "Main bot" }],
      },
      channelDefaultAccountId: { telegram: "default" },
    });
    props.configForm = {
      channels: {
        telegram: {
          enabled: true,
          botToken: "old-token",
        },
      },
    };
    props.onConfigPatch = onConfigPatch;

    const container = document.createElement("div");
    render(
      renderConfigureChannels({
        ...props,
        activeChannelId: "telegram",
        onActiveChannelChange: vi.fn(),
        onConfigRemove,
      }),
      container,
    );

    expect(container.textContent).toContain("Add account");
    expect(container.textContent).toContain("Main bot");

    const tokenInput = Array.from(container.querySelectorAll<HTMLInputElement>("input")).find(
      (input) => input.value === "old-token",
    );
    expect(tokenInput).toBeInstanceOf(HTMLInputElement);
    tokenInput!.value = "new-token";
    tokenInput!.dispatchEvent(new Event("input"));
    expect(onConfigPatch).toHaveBeenCalledWith(["channels", "telegram", "botToken"], "new-token");

    const accountInput = Array.from(container.querySelectorAll<HTMLInputElement>("input")).find(
      (input) => input.placeholder === "default / work / personal",
    );
    expect(accountInput).toBeInstanceOf(HTMLInputElement);
    accountInput!.value = "alerts";
    accountInput!.dispatchEvent(new Event("input"));
    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Add",
    );
    expect(addButton).toBeInstanceOf(HTMLButtonElement);
    (addButton as HTMLButtonElement).click();
    expect(onConfigPatch).toHaveBeenCalledWith(["channels", "telegram", "accounts", "alerts"], {
      enabled: true,
    });

    const deleteButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Delete account",
    );
    expect(deleteButton).toBeInstanceOf(HTMLButtonElement);
    (deleteButton as HTMLButtonElement).click();
    expect(onConfigRemove).toHaveBeenCalledWith(["channels", "telegram"]);
  });

  it("shows a friendly message when the WhatsApp web login provider is unavailable", () => {
    const props = createProps({
      ts: Date.now(),
      channelOrder: ["whatsapp"],
      channelLabels: { whatsapp: "WhatsApp" },
      channelMeta: [{ id: "whatsapp", label: "WhatsApp", detailLabel: "WhatsApp" }],
      channels: { whatsapp: { configured: true } },
      channelAccounts: {
        whatsapp: [{ accountId: "default", configured: true, name: "Main phone" }],
      },
      channelDefaultAccountId: { whatsapp: "default" },
    });
    props.whatsappMessage = "GatewayRequestError: web login provider is not available";

    const container = document.createElement("div");
    render(
      renderConfigureChannels({
        ...props,
        activeChannelId: "whatsapp",
        onActiveChannelChange: vi.fn(),
        onConfigRemove: vi.fn(),
      }),
      container,
    );

    expect(container.textContent).toContain(
      "WhatsApp Web login belum tersedia di gateway yang lagi jalan.",
    );
    expect(container.textContent).not.toContain(
      "GatewayRequestError: web login provider is not available",
    );
    const showQrButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Show QR",
    );
    expect(showQrButton).toBeInstanceOf(HTMLButtonElement);
    expect((showQrButton as HTMLButtonElement).disabled).toBe(true);
  });
});
