// ==UserScript==
// @name         Bulk Seller for Augmented Steam extension
// @namespace    https://github.com/Dobbelklick/BulkCardSellerForAugmentedSteam
// @version      1.1
// @description  Batch-click Augmented Steam Quick Sell or Instant Sell for the 25 visible inventory items on the current Steam inventory page.
// @homepageURL  https://github.com/Dobbelklick/BulkCardSellerForAugmentedSteam
// @supportURL   https://github.com/Dobbelklick/BulkCardSellerForAugmentedSteam/issues
// @downloadURL  https://raw.githubusercontent.com/Dobbelklick/BulkCardSellerForAugmentedSteam/main/bulk-card-seller-for-augmented-steam.user.js
// @updateURL    https://raw.githubusercontent.com/Dobbelklick/BulkCardSellerForAugmentedSteam/main/bulk-card-seller-for-augmented-steam.meta.js
// @match        https://steamcommunity.com/id/*/inventory*
// @match        https://steamcommunity.com/profiles/*/inventory*
// @match        https://steamcommunity.com/market/
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    // =========================================================================
    // Configuration And Runtime State
    // =========================================================================

    const CONFIG = {
        maxVisibleItems: 25,
        defaultMaxSellPrice: 0.10,
        interItemDelayMs: 2000,
        selectionSettledDelayMs: 250,
        postSellSettledDelayMs: 1000,
        marketRemoveDelayMs: 300,
        marketPageChangeDelayMs: 1200,
        pollIntervalMs: 150,
        itemInfoTimeoutMs: 4000,
        sellControlsTimeoutMs: 5000,
        postSellTimeoutMs: 5000,
        marketRemoveTimeoutMs: 12000,
        marketPageChangeTimeoutMs: 8000,
        strictCardFilter: true,
        cardTagTexts: ["Trading Card"],
        uiPosition: {
            top: "18px",
            right: "18px"
        }
    };

    const UI_ID = "as-bulk-seller-widget";

    const state = {
        running: false,
        stopRequested: false,
        currentIndex: 0,
        total: 0,
        sold: 0,
        skipped: 0,
        failed: 0,
        lastMessage: "Idle"
    };

    const ui = {
        root: null,
        startButton: null,
        removeListingsButton: null,
        stopButton: null,
        status: null,
        counters: null,
        detail: null,
        progressTrack: null,
        progressFill: null,
        progressLabel: null,
        protocolTableBody: null,
        settingsRow: null,
        maxPriceInput: null,
        maxPricePrefix: null,
        maxPriceSuffix: null,
        preferInstantSellCheckbox: null,
        instantSellRow: null
    };

    const PAGE_MODE = {
        inventory: "inventory",
        market: "market",
        unsupported: "unsupported"
    };

    const STEAM_CURRENCY_FORMATS = {
        1: { code: "USD", symbol: "$", right: false },
        2: { code: "GBP", symbol: "£", right: false },
        3: { code: "EUR", symbol: "€", right: true },
        4: { code: "CHF", symbol: "CHF", right: false },
        5: { code: "RUB", symbol: "pуб.", right: true },
        6: { code: "PLN", symbol: "zł", right: true },
        7: { code: "BRL", symbol: "R$", right: false },
        8: { code: "JPY", symbol: "¥", right: false },
        9: { code: "NOK", symbol: "kr", right: true },
        10: { code: "IDR", symbol: "Rp", right: false },
        11: { code: "MYR", symbol: "RM", right: false },
        12: { code: "PHP", symbol: "P", right: false },
        13: { code: "SGD", symbol: "S$", right: false },
        14: { code: "THB", symbol: "฿", right: false },
        15: { code: "VND", symbol: "₫", right: false },
        16: { code: "KRW", symbol: "₩", right: false },
        17: { code: "TRY", symbol: "TL", right: true },
        18: { code: "UAH", symbol: "₴", right: true },
        19: { code: "MXN", symbol: "Mex$", right: false },
        20: { code: "CAD", symbol: "CDN$", right: false },
        21: { code: "AUD", symbol: "A$", right: false },
        22: { code: "NZD", symbol: "NZ$", right: false },
        23: { code: "CNY", symbol: "¥", right: false },
        24: { code: "INR", symbol: "₹", right: false },
        25: { code: "CLP", symbol: "CLP$", right: false },
        26: { code: "PEN", symbol: "S/.", right: false },
        27: { code: "COP", symbol: "COL$", right: false },
        28: { code: "ZAR", symbol: "R", right: false },
        29: { code: "HKD", symbol: "HK$", right: false },
        30: { code: "TWD", symbol: "NT$", right: false },
        31: { code: "SAR", symbol: "SR", right: true },
        32: { code: "AED", symbol: "DH", right: true },
        33: { code: "SEK", symbol: "kr", right: true },
        34: { code: "ARS", symbol: "ARS$", right: false },
        35: { code: "ILS", symbol: "₪", right: false },
        36: { code: "BYN", symbol: "Br", right: false },
        37: { code: "KZT", symbol: "₸", right: false },
        38: { code: "KWD", symbol: "KD", right: true },
        39: { code: "QAR", symbol: "QR", right: true },
        40: { code: "CRC", symbol: "₡", right: false },
        41: { code: "UYU", symbol: "$U", right: false }
    };

    // =========================================================================
    // Shared Helpers
    // =========================================================================

    function sleep(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    function setSleepProgress(active, ratio, label) {
        if (!ui.progressTrack || !ui.progressFill || !ui.progressLabel) {
            return;
        }

        if (!active) {
            ui.progressTrack.style.display = "none";
            ui.progressFill.style.width = "0%";
            ui.progressLabel.textContent = "";
            return;
        }

        const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
        ui.progressTrack.style.display = "block";
        ui.progressFill.style.width = `${percent}%`;
        ui.progressLabel.textContent = label || `Sleeping ${percent}%`;
    }

    async function sleepWithProgress(ms, label) {
        const started = Date.now();

        setSleepProgress(true, 0, `${label} (0%)`);

        while (true) {
            const elapsed = Date.now() - started;
            const ratio = Math.min(elapsed / ms, 1);
            setSleepProgress(true, ratio, `${label} (${Math.round(ratio * 100)}%)`);

            if (ratio >= 1 || state.stopRequested) {
                break;
            }

            await sleep(Math.min(100, Math.max(1, ms - elapsed)));
        }

        setSleepProgress(false, 0, "");
    }

    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style = window.getComputedStyle(element);
        return style.display !== "none"
            && style.visibility !== "hidden"
            && style.opacity !== "0"
            && element.getClientRects().length > 0;
    }

    function textContent(element) {
        return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    }

    function getPageMode() {
        const path = window.location.pathname;
        if (/^\/(id|profiles)\/[^/]+\/inventory/.test(path)) {
            return PAGE_MODE.inventory;
        }

        if (path === "/market/" || path === "/market") {
            return PAGE_MODE.market;
        }

        return PAGE_MODE.unsupported;
    }

    function isInventoryPage() {
        return getPageMode() === PAGE_MODE.inventory;
    }

    function isMarketPage() {
        return getPageMode() === PAGE_MODE.market;
    }

    function updateState(message) {
        if (message) {
            state.lastMessage = message;
        }

        if (ui.status) {
            ui.status.textContent = state.lastMessage;
        }

        if (ui.counters) {
            const successLabel = isMarketPage() ? "Removed" : "Sold";
            ui.counters.textContent = [
                `${successLabel} ${state.sold}`,
                `Skipped ${state.skipped}`,
                `Failed ${state.failed}`
            ].join(" | ");
        }

        if (ui.startButton) {
            ui.startButton.disabled = state.running || !isInventoryPage();
        }

        if (ui.removeListingsButton) {
            ui.removeListingsButton.disabled = state.running || !isMarketPage();
        }

        if (ui.stopButton) {
            ui.stopButton.disabled = !state.running;
        }

        if (ui.settingsRow) {
            ui.settingsRow.style.display = isInventoryPage() ? "flex" : "none";
        }

        if (ui.instantSellRow) {
            ui.instantSellRow.style.display = isInventoryPage() ? "flex" : "none";
        }
    }

    function setDetail(message) {
        if (ui.detail) {
            ui.detail.textContent = message;
        }
    }

    function getMaxSellPrice() {
        const rawValue = ui.maxPriceInput?.value?.trim();
        const parsed = Number.parseFloat(rawValue ?? "");

        if (Number.isFinite(parsed) && parsed >= 0) {
            return parsed;
        }

        return CONFIG.defaultMaxSellPrice;
    }

    function shortText(value, maxLength) {
        if (!value) {
            return "-";
        }

        if (value.length <= maxLength) {
            return value;
        }

        return `${value.slice(0, maxLength - 1)}...`;
    }

    function getWalletCurrencyFormat() {
        const currencyId = window.g_rgWalletInfo?.wallet_currency;
        return STEAM_CURRENCY_FORMATS[currencyId] ?? null;
    }

    function updateMaxPriceCurrencyDisplay() {
        if (!ui.maxPricePrefix || !ui.maxPriceSuffix || !ui.maxPriceInput) {
            return;
        }

        const format = getWalletCurrencyFormat();
        const prefix = format && !format.right ? format.symbol : "";
        const suffix = format && format.right ? format.symbol : "";

        ui.maxPricePrefix.textContent = prefix;
        ui.maxPricePrefix.style.display = prefix ? "block" : "none";
        ui.maxPriceSuffix.textContent = suffix;
        ui.maxPriceSuffix.style.display = suffix ? "block" : "none";
        ui.maxPriceInput.title = format
            ? `Price cap in ${format.code}`
            : "Price cap in your Steam wallet currency";
    }

    // =========================================================================
    // Widget Rendering
    // =========================================================================

    function addProtocolRow(entry) {
        if (!ui.protocolTableBody) {
            return;
        }

        const row = document.createElement("tr");
        row.style.borderTop = "1px solid rgba(255, 255, 255, 0.08)";

        const values = [
            String(entry.index ?? "-"),
            shortText(entry.item, 22),
            shortText(entry.result, 42)
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            cell.style.padding = "4px 6px";
            cell.style.verticalAlign = "top";
            if (index === 0) {
                cell.style.whiteSpace = "nowrap";
            } else {
                cell.style.wordBreak = "break-word";
            }
            row.append(cell);
        });

        ui.protocolTableBody.prepend(row);
        ui.protocolTableBody.parentElement.scrollTop = 0;
    }

    function resetRunState() {
        state.stopRequested = false;
        state.currentIndex = 0;
        state.total = 0;
        state.sold = 0;
        state.skipped = 0;
        state.failed = 0;
        setSleepProgress(false, 0, "");
        if (ui.protocolTableBody) {
            ui.protocolTableBody.textContent = "";
        }
    }

    function updateWidgetForCurrentPage() {
        if (!ui.startButton || !ui.removeListingsButton) {
            return;
        }

        const pageMode = getPageMode();
        ui.startButton.style.display = pageMode === PAGE_MODE.inventory ? "block" : "none";
        ui.removeListingsButton.style.display = pageMode === PAGE_MODE.market ? "block" : "none";

        if (ui.root) {
            ui.root.style.display = pageMode === PAGE_MODE.unsupported ? "none" : "block";
        }
    }

    function createWidget() {
        if (document.getElementById(UI_ID)) {
            return;
        }

        const root = document.createElement("div");
        root.id = UI_ID;
        root.style.position = "fixed";
        root.style.top = CONFIG.uiPosition.top;
        root.style.right = CONFIG.uiPosition.right;
        root.style.zIndex = "99999";
        root.style.width = "330px";
        root.style.padding = "12px";
        root.style.borderRadius = "12px";
        root.style.background = "rgba(18, 26, 35, 0.95)";
        root.style.color = "#e5edf5";
        root.style.boxShadow = "0 16px 36px rgba(0, 0, 0, 0.35)";
        root.style.border = "1px solid rgba(111, 161, 201, 0.28)";
        root.style.fontFamily = "Motiva Sans, Arial, sans-serif";
        root.style.fontSize = "12px";

        const title = document.createElement("div");
        title.textContent = "Bulk Seller for Augmented Steam";
        title.style.fontSize = "13px";
        title.style.fontWeight = "700";
        title.style.marginBottom = "8px";

        const status = document.createElement("div");
        status.style.fontWeight = "600";
        status.style.color = "#9fd3ff";
        status.style.marginBottom = "6px";

        const counters = document.createElement("div");
        counters.style.lineHeight = "1.45";
        counters.style.color = "#b8c6d3";
        counters.style.marginBottom = "8px";

        const detail = document.createElement("div");
        detail.style.minHeight = "32px";
        detail.style.lineHeight = "1.4";
        detail.style.color = "#dce6ef";
        detail.style.marginBottom = "10px";
        detail.textContent = "Waiting for a user action.";

        const progressTrack = document.createElement("div");
        progressTrack.style.display = "none";
        progressTrack.style.height = "8px";
        progressTrack.style.marginBottom = "6px";
        progressTrack.style.borderRadius = "999px";
        progressTrack.style.overflow = "hidden";
        progressTrack.style.background = "rgba(255, 255, 255, 0.12)";

        const progressFill = document.createElement("div");
        progressFill.style.width = "0%";
        progressFill.style.height = "100%";
        progressFill.style.background = "linear-gradient(90deg, #80a006 0%, #9fd3ff 100%)";
        progressFill.style.transition = "width 90ms linear";
        progressTrack.append(progressFill);

        const progressLabel = document.createElement("div");
        progressLabel.style.minHeight = "14px";
        progressLabel.style.marginBottom = "10px";
        progressLabel.style.fontSize = "11px";
        progressLabel.style.color = "#9fb2c3";

        const settingsRow = document.createElement("div");
        settingsRow.style.display = "flex";
        settingsRow.style.alignItems = "center";
        settingsRow.style.justifyContent = "space-between";
        settingsRow.style.gap = "8px";
        settingsRow.style.marginBottom = "10px";

        const maxPriceLabel = document.createElement("label");
        maxPriceLabel.textContent = "Skip if price is over";
        maxPriceLabel.style.color = "#b8c6d3";
        maxPriceLabel.style.fontSize = "11px";
        maxPriceLabel.style.fontWeight = "600";

        const maxPriceControl = document.createElement("div");
        maxPriceControl.style.display = "flex";
        maxPriceControl.style.alignItems = "center";
        maxPriceControl.style.gap = "4px";

        const maxPricePrefix = document.createElement("span");
        maxPricePrefix.style.display = "none";
        maxPricePrefix.style.minWidth = "12px";
        maxPricePrefix.style.color = "#dce6ef";
        maxPricePrefix.style.fontWeight = "600";
        maxPricePrefix.style.textAlign = "right";

        const maxPriceInput = document.createElement("input");
        maxPriceInput.type = "number";
        maxPriceInput.min = "0";
        maxPriceInput.step = "0.01";
        maxPriceInput.value = CONFIG.defaultMaxSellPrice.toFixed(2);
        maxPriceInput.style.width = "72px";
        maxPriceInput.style.padding = "4px 6px";
        maxPriceInput.style.borderRadius = "6px";
        maxPriceInput.style.border = "1px solid rgba(255, 255, 255, 0.12)";
        maxPriceInput.style.background = "rgba(255, 255, 255, 0.08)";
        maxPriceInput.style.color = "#e5edf5";
        maxPriceInput.style.font = "inherit";

        const maxPriceSuffix = document.createElement("span");
        maxPriceSuffix.style.display = "none";
        maxPriceSuffix.style.minWidth = "12px";
        maxPriceSuffix.style.color = "#dce6ef";
        maxPriceSuffix.style.fontWeight = "600";

        maxPriceControl.append(maxPricePrefix, maxPriceInput, maxPriceSuffix);

        settingsRow.append(maxPriceLabel, maxPriceControl);

        const instantSellRow = document.createElement("div");
        instantSellRow.style.display = "flex";
        instantSellRow.style.alignItems = "center";
        instantSellRow.style.gap = "6px";
        instantSellRow.style.marginBottom = "10px";

        const preferInstantSellCheckbox = document.createElement("input");
        preferInstantSellCheckbox.type = "checkbox";
        preferInstantSellCheckbox.id = "as-bulk-prefer-instant-sell";

        const preferInstantSellLabel = document.createElement("label");
        preferInstantSellLabel.htmlFor = "as-bulk-prefer-instant-sell";
        preferInstantSellLabel.textContent = "Prefer Instant Sell over Quick Sell";
        preferInstantSellLabel.style.color = "#b8c6d3";
        preferInstantSellLabel.style.fontSize = "11px";
        preferInstantSellLabel.style.fontWeight = "600";
        preferInstantSellLabel.style.cursor = "pointer";

        instantSellRow.append(preferInstantSellCheckbox, preferInstantSellLabel);

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.marginBottom = "10px";

        const startButton = document.createElement("button");
        startButton.type = "button";
        startButton.textContent = "Sell Visible Cards";
        buttonStyle(startButton, "#80a006", "#ffffff");
        startButton.style.flex = "1";

        const removeListingsButton = document.createElement("button");
        removeListingsButton.type = "button";
        removeListingsButton.textContent = "Remove Active Listings";
        buttonStyle(removeListingsButton, "#b84a2a", "#ffffff");
        removeListingsButton.style.flex = "1";
        removeListingsButton.style.display = "none";

        const stopButton = document.createElement("button");
        stopButton.type = "button";
        stopButton.textContent = "Stop";
        buttonStyle(stopButton, "#345", "#ffffff");
        stopButton.style.width = "74px";

        startButton.addEventListener("click", () => {
            void startRun();
        });

        removeListingsButton.addEventListener("click", () => {
            void startRemoveListingsRun();
        });

        stopButton.addEventListener("click", () => {
            requestStop("Stop requested by user.");
        });

        const protocolTitle = document.createElement("div");
        protocolTitle.textContent = "Protocol";
        protocolTitle.style.marginBottom = "6px";
        protocolTitle.style.fontSize = "11px";
        protocolTitle.style.fontWeight = "700";
        protocolTitle.style.color = "#b8c6d3";

        const protocolWrap = document.createElement("div");
        protocolWrap.style.maxHeight = "180px";
        protocolWrap.style.overflowY = "auto";
        protocolWrap.style.borderRadius = "8px";
        protocolWrap.style.border = "1px solid rgba(255, 255, 255, 0.08)";
        protocolWrap.style.background = "rgba(9, 14, 20, 0.45)";

        const protocolTable = document.createElement("table");
        protocolTable.style.width = "100%";
        protocolTable.style.borderCollapse = "collapse";
        protocolTable.style.fontSize = "10px";
        protocolTable.style.color = "#d2dde7";

        const protocolHead = document.createElement("thead");
        const headRow = document.createElement("tr");
        headRow.style.position = "sticky";
        headRow.style.top = "0";
        headRow.style.background = "rgba(24, 34, 46, 0.98)";

        for (const label of ["#", "Item", "Protocol"]) {
            const cell = document.createElement("th");
            cell.textContent = label;
            cell.style.padding = "5px 6px";
            cell.style.textAlign = "left";
            cell.style.fontWeight = "700";
            cell.style.borderBottom = "1px solid rgba(255, 255, 255, 0.08)";
            headRow.append(cell);
        }

        const protocolTableBody = document.createElement("tbody");
        protocolHead.append(headRow);
        protocolTable.append(protocolHead, protocolTableBody);
        protocolWrap.append(protocolTable);

        actions.append(startButton, removeListingsButton, stopButton);
        root.append(title, status, counters, detail, progressTrack, progressLabel, settingsRow, instantSellRow, actions, protocolTitle, protocolWrap);
        document.body.append(root);

        ui.root = root;
        ui.startButton = startButton;
        ui.removeListingsButton = removeListingsButton;
        ui.stopButton = stopButton;
        ui.status = status;
        ui.counters = counters;
        ui.detail = detail;
        ui.progressTrack = progressTrack;
        ui.progressFill = progressFill;
        ui.progressLabel = progressLabel;
        ui.protocolTableBody = protocolTableBody;
        ui.settingsRow = settingsRow;
        ui.maxPriceInput = maxPriceInput;
        ui.maxPricePrefix = maxPricePrefix;
        ui.maxPriceSuffix = maxPriceSuffix;
        ui.preferInstantSellCheckbox = preferInstantSellCheckbox;
        ui.instantSellRow = instantSellRow;

        updateMaxPriceCurrencyDisplay();
        updateWidgetForCurrentPage();
        updateState("Idle");
    }

    function buttonStyle(button, background, color) {
        button.style.border = "0";
        button.style.borderRadius = "8px";
        button.style.padding = "8px 10px";
        button.style.cursor = "pointer";
        button.style.fontWeight = "700";
        button.style.background = background;
        button.style.color = color;
    }

    function requestStop(message) {
        state.stopRequested = true;
        state.lastMessage = message;
        updateState();
        setDetail(message);
    }

    // =========================================================================
    // Inventory And Item Introspection
    // =========================================================================

    function getVisibleInventoryPage() {
        const pages = Array.from(document.querySelectorAll("#inventories .inventory_page"));
        return pages.find(isVisible) ?? null;
    }

    function getVisibleInventoryItems() {
        const page = getVisibleInventoryPage();
        if (!page) {
            return [];
        }

        const candidates = Array.from(page.querySelectorAll("div.context6, div[class*='context']"));
        const items = candidates.filter(element => isVisible(element) && element.id);
        return items.slice(0, CONFIG.maxVisibleItems);
    }

    function getInventoryDetailsRoot() {
        const root = document.querySelector(".inventory_page_right");
        return isVisible(root) ? root : null;
    }

    function getActiveItemInfoPanel() {
        const detailsRoot = getInventoryDetailsRoot();
        if (detailsRoot) {
            return detailsRoot;
        }

        const panels = Array.from(document.querySelectorAll(".inventory_iteminfo"));
        const visiblePanel = panels.find(isVisible);
        if (visiblePanel) {
            return visiblePanel;
        }

        const itemInfoById = Array.from(document.querySelectorAll("[id*='iteminfo']"));
        return itemInfoById.find(isVisible) ?? null;
    }

    function getSelectedInventoryItem() {
        return window.g_ActiveInventory?.selectedItem ?? null;
    }

    function getSelectedInventoryElements() {
        const selectedItem = getSelectedInventoryItem();
        return [
            selectedItem?.element,
            selectedItem?.homeElement,
            selectedItem?.el,
            selectedItem?.itemEl
        ].filter(Boolean);
    }

    function isInventoryItemSelected(item) {
        if (!item) {
            return false;
        }

        const anchor = item.querySelector("a");
        const candidates = [item, anchor, item.parentElement].filter(Boolean);

        if (candidates.some(node => node.classList?.contains("activeInfo"))) {
            return true;
        }

        const selectedElements = getSelectedInventoryElements();
        return selectedElements.some(element => element === item || element === anchor || element?.id === item.id);
    }

    function getItemTileName(item) {
        if (!item) {
            return "";
        }

        const selectors = [
            "img[alt]",
            "img",
            "a[title]",
            "[title]"
        ];

        for (const selector of selectors) {
            const node = item.querySelector(selector);
            if (!node) {
                continue;
            }

            const value = textContent(node.getAttribute?.("alt"))
                || textContent(node.getAttribute?.("title"))
                || textContent(node.textContent);

            if (value) {
                return value;
            }
        }

        return "";
    }

    function getSelectedItemName() {
        const selectedItem = getSelectedInventoryItem();
        if (!selectedItem) {
            return "";
        }

        return selectedItem.description?.name
            || selectedItem.description?.market_hash_name
            || selectedItem.description?.type
            || "";
    }

    function getItemName(panel, item) {
        if (!panel) {
            return getItemTileName(item) || getSelectedItemName() || "Unknown item";
        }

        const selectors = [
            "[id*='_item_name']",
            ".item_desc_description [class*='item_desc_name']",
            ".item_desc_description",
            ".hover_item_name"
        ];

        for (const selector of selectors) {
            const value = textContent(panel.querySelector(selector));
            if (value) {
                return value;
            }
        }

        return getItemTileName(item) || getSelectedItemName() || "Unknown item";
    }

    function getTagText(panel) {
        if (!panel) {
            return "";
        }

        const selectors = [
            "[id*='_item_tags_content']",
            "[id*='_item_type']",
            ".item_desc_descriptors",
            ".descriptor"
        ];

        const parts = selectors
            .flatMap(selector => Array.from(panel.querySelectorAll(selector)))
            .map(textContent)
            .filter(Boolean);

        if (parts.length > 0) {
            return parts.join(" | ");
        }

        return textContent(panel);
    }

    function isTradingCard(panel) {
        if (!CONFIG.strictCardFilter) {
            return true;
        }

        const tags = getTagText(panel);
        return CONFIG.cardTagTexts.some(tag => tags.includes(tag));
    }

    function getSelectedItemCardMeta() {
        const selectedItem = getSelectedInventoryItem();
        if (!selectedItem?.description) {
            return null;
        }

        const tags = Array.isArray(selectedItem.description.tags) ? selectedItem.description.tags : [];
        const itemClass = tags.find(tag => tag.category === "item_class")?.internal_name || "";
        const typeText = selectedItem.description.type || "";
        const name = selectedItem.description.name
            || selectedItem.description.market_hash_name
            || selectedItem.description.type
            || "Unknown item";

        if (itemClass) {
            return {
                name,
                raw: itemClass,
                isCard: itemClass === "item_class_2"
            };
        }

        if (typeText) {
            return {
                name,
                raw: typeText,
                isCard: CONFIG.cardTagTexts.some(tag => typeText.includes(tag))
            };
        }

        return null;
    }

    function getSelectedItemMarketabilityMeta() {
        const selectedItem = getSelectedInventoryItem();
        if (!selectedItem?.description) {
            return null;
        }

        const name = selectedItem.description.name
            || selectedItem.description.market_hash_name
            || selectedItem.description.type
            || "Unknown item";
        const marketable = selectedItem.description.marketable;

        return {
            name,
            isMarketable: marketable === 1 || marketable === true || marketable === "1"
        };
    }

    // =========================================================================
    // Augmented Steam Sell Controls
    // =========================================================================

    function isAugmentedSteamSellButton(button, expectedId) {
        if (!button || !isVisible(button)) {
            return false;
        }

        return button.id === expectedId
            && button.classList.contains("as-inv-btn")
            && button.closest(".es_qsell_ctn") !== null;
    }

    function parseDisplayedPrice(text) {
        const matches = text.match(/\d[\d\s.,]*/g);
        if (!matches || matches.length === 0) {
            return null;
        }

        const candidate = matches[matches.length - 1].replace(/\s+/g, "");
        const lastComma = candidate.lastIndexOf(",");
        const lastDot = candidate.lastIndexOf(".");

        let normalized = candidate;
        if (lastComma !== -1 && lastDot !== -1) {
            if (lastComma > lastDot) {
                normalized = candidate.replace(/\./g, "").replace(",", ".");
            } else {
                normalized = candidate.replace(/,/g, "");
            }
        } else if (lastComma !== -1) {
            normalized = candidate.replace(",", ".");
        }

        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function getButtonPrice(button) {
        if (!button) {
            return null;
        }

        return parseDisplayedPrice(textContent(button))
            ?? parseDisplayedPrice(button.getAttribute("data-tooltip-text") || "");
    }

    function getSellButtons(panel) {
        const root = panel || getInventoryDetailsRoot() || getActiveItemInfoPanel();
        if (!root) {
            return { quick: null, instant: null };
        }

        const quickCandidate = root.querySelector("#as_qsell");
        const instantCandidate = root.querySelector("#as_isell");

        const quick = isAugmentedSteamSellButton(quickCandidate, "as_qsell") ? quickCandidate : null;
        const instant = isAugmentedSteamSellButton(instantCandidate, "as_isell") ? instantCandidate : null;

        return {
            quick,
            instant
        };
    }

    // =========================================================================
    // Market Listing Introspection
    // =========================================================================

    function getActiveListingsRows() {
        const container = document.getElementById("tabContentsMyActiveMarketListingsRows");
        if (!container || !isVisible(container)) {
            return [];
        }

        return Array.from(container.querySelectorAll(".market_listing_row"))
            .filter(row => isVisible(row));
    }

    function getActiveListingRemoveButton(row) {
        if (!row) {
            return null;
        }

        const buttons = Array.from(row.querySelectorAll("a.item_market_action_button"));
        return buttons.find(button => /^remove$/i.test(textContent(button))) ?? null;
    }

    function getActiveListingName(row) {
        return textContent(row?.querySelector(".market_listing_item_name")) || row?.id || "Unknown listing";
    }

    function getActiveListingsTotal() {
        const totalNode = document.getElementById("tabContentsMyActiveMarketListings_total");
        const total = Number.parseInt(textContent(totalNode), 10);
        return Number.isFinite(total) ? total : getActiveListingsRows().length;
    }

    function getActiveListingsNextButton() {
        const button = document.getElementById("tabContentsMyActiveMarketListings_btn_next");
        if (!button || button.classList.contains("disabled") || !isVisible(button)) {
            return null;
        }

        return button;
    }

    function getActiveListingsPageMarker() {
        const start = textContent(document.getElementById("tabContentsMyActiveMarketListings_start"));
        const end = textContent(document.getElementById("tabContentsMyActiveMarketListings_end"));
        const total = textContent(document.getElementById("tabContentsMyActiveMarketListings_total"));
        return `${start}-${end}-${total}`;
    }

    function getMarketRemoveListingDialog() {
        const dialog = document.getElementById("market_removelisting_dialog");
        return dialog && isVisible(dialog) ? dialog : null;
    }

    function getMarketRemoveListingAcceptButton() {
        const button = document.getElementById("market_removelisting_dialog_accept");
        return button && isVisible(button) ? button : null;
    }

    // =========================================================================
    // Async Waits And Selection Flow
    // =========================================================================

    async function waitFor(condition, timeoutMs) {
        const started = Date.now();

        while (Date.now() - started < timeoutMs) {
            if (state.stopRequested) {
                return null;
            }

            const value = condition();
            if (value) {
                return value;
            }

            await sleep(CONFIG.pollIntervalMs);
        }

        return null;
    }

    async function selectInventoryItem(item) {
        const clickable = item.querySelector("a") ?? item;
        const previousSelectedItem = getSelectedInventoryItem();
        const previousItemName = getSelectedItemName();
        const targetItemName = getItemTileName(item);
        clickable.click();

        // Steam can keep the previous detail panel visible briefly after a click.
        // Only accept the panel once the clicked tile is selected and the content
        // looks fresh enough to belong to the newly selected item.
        const panel = await waitFor(() => {
            const selectedItem = getSelectedInventoryItem();
            const currentPanel = getActiveItemInfoPanel();
            if (!currentPanel) {
                return null;
            }

            const name = getItemName(currentPanel, item);
            const selectionChanged = selectedItem !== previousSelectedItem || isInventoryItemSelected(item);
            const nameMatchesTarget = Boolean(targetItemName) && name === targetItemName;
            const isFreshPanel = !previousItemName || name !== previousItemName;

            if (selectionChanged && name && (isFreshPanel || nameMatchesTarget || !targetItemName)) {
                return currentPanel;
            }

            return null;
        }, CONFIG.itemInfoTimeoutMs);

        if (panel) {
            await sleepWithProgress(CONFIG.selectionSettledDelayMs, "Waiting for item selection");
        }

        return panel;
    }

    async function waitForSellButtons(panel) {
        const result = await waitFor(() => {
            const currentPanel = getInventoryDetailsRoot() || getActiveItemInfoPanel() || panel;
            const buttons = getSellButtons(currentPanel);
            if (buttons.quick || buttons.instant) {
                return {
                    panel: currentPanel,
                    buttons
                };
            }

            return null;
        }, CONFIG.sellControlsTimeoutMs);

        return result;
    }

    async function waitForPostSellChange(clickedButton) {
        return waitFor(() => {
            if (!clickedButton.isConnected || !isVisible(clickedButton)) {
                return "button-disappeared";
            }

            const activePanel = getActiveItemInfoPanel();
            const buttons = getSellButtons(activePanel);
            if (!buttons.quick && !buttons.instant) {
                return "controls-cleared";
            }

            return null;
        }, CONFIG.postSellTimeoutMs);
    }

    async function waitForMarketRemoveChange(row, previousTotal) {
        return waitFor(() => {
            if (!row.isConnected || !isVisible(row)) {
                return "row-disappeared";
            }

            const removeButton = getActiveListingRemoveButton(row);
            if (!removeButton || !removeButton.isConnected || !isVisible(removeButton)) {
                return "button-disappeared";
            }

            const currentTotal = getActiveListingsTotal();
            if (currentTotal < previousTotal) {
                return "count-decreased";
            }

            return null;
        }, CONFIG.marketRemoveTimeoutMs);
    }

    async function confirmMarketRemoveDialog() {
        const confirmationState = await waitFor(() => {
            const dialog = getMarketRemoveListingDialog();
            const acceptButton = getMarketRemoveListingAcceptButton();

            if (dialog && acceptButton) {
                return { dialog, acceptButton };
            }

            return null;
        }, CONFIG.marketRemoveTimeoutMs);

        if (!confirmationState) {
            return false;
        }

        confirmationState.acceptButton.click();
        return true;
    }

    async function waitForMarketPageChange(previousMarker) {
        return waitFor(() => {
            const currentMarker = getActiveListingsPageMarker();
            if (currentMarker && currentMarker !== previousMarker) {
                return currentMarker;
            }

            return null;
        }, CONFIG.marketPageChangeTimeoutMs);
    }

    // =========================================================================
    // Batch Processing
    // =========================================================================

    async function processItem(item, index) {
        state.currentIndex = index + 1;
        updateState(`Processing item ${state.currentIndex}/${state.total}`);

        const panel = await selectInventoryItem(item);
        if (!panel) {
            state.failed += 1;
            setDetail(`Item ${index + 1}: failed to load details.`);
            addProtocolRow({
                index: index + 1,
                item: getItemTileName(item) || item.id,
                result: "No detail panel"
            });
            return { shouldDelay: false };
        }

        const selectedCardMeta = getSelectedItemCardMeta();
        if (CONFIG.strictCardFilter && selectedCardMeta && !selectedCardMeta.isCard) {
            state.skipped += 1;
            setDetail(`Skipped non-card item: ${selectedCardMeta.name}`);
            addProtocolRow({
                index: index + 1,
                item: selectedCardMeta.name,
                result: `Fast skip: ${shortText(selectedCardMeta.raw, 24)}`
            });
            return { shouldDelay: false };
        }

        // Augmented Steam only renders sell controls for items that are actually
        // marketable, so short-circuit here instead of waiting out the timeout.
        const marketabilityMeta = getSelectedItemMarketabilityMeta();
        if (marketabilityMeta && !marketabilityMeta.isMarketable) {
            state.skipped += 1;
            setDetail(`Skipped non-marketable item: ${marketabilityMeta.name}`);
            addProtocolRow({
                index: index + 1,
                item: marketabilityMeta.name,
                result: "Non-marketable"
            });
            return { shouldDelay: false };
        }

        const sellState = await waitForSellButtons(panel);
        if (!sellState) {
            const resolvedPanel = getActiveItemInfoPanel() || panel;
            const itemName = getItemName(resolvedPanel, item);
            state.skipped += 1;
            setDetail(`Skipped unsellable card: ${itemName}`);
            addProtocolRow({
                index: index + 1,
                item: itemName,
                result: "No AS sell button"
            });
            return { shouldDelay: false };
        }

        const resolvedPanel = sellState.panel || getActiveItemInfoPanel() || panel;
        const itemName = getItemName(resolvedPanel, item);
        const tagText = getTagText(resolvedPanel);

        if (!isTradingCard(resolvedPanel)) {
            state.skipped += 1;
            setDetail(`Skipped non-card item: ${itemName}`);
            addProtocolRow({
                index: index + 1,
                item: itemName,
                result: shortText(tagText, 30)
            });
            return { shouldDelay: false };
        }

        const preferInstantSell = ui.preferInstantSellCheckbox?.checked ?? false;
        const button = preferInstantSell
            ? (sellState.buttons.instant || sellState.buttons.quick)
            : (sellState.buttons.quick || sellState.buttons.instant);
        const mode = button === sellState.buttons.instant ? "Instant Sell" : "Quick Sell";
        let shouldDelay = true;
        const buttonPrice = getButtonPrice(button);
        const maxSellPrice = getMaxSellPrice();

        if (buttonPrice !== null && buttonPrice > maxSellPrice) {
            state.skipped += 1;
            setDetail(`Skipped expensive item: ${itemName}`);
            addProtocolRow({
                index: index + 1,
                item: itemName,
                result: `Over cap: ${buttonPrice.toFixed(2)} > ${maxSellPrice.toFixed(2)}`
            });
            return { shouldDelay: false };
        }

        setDetail(`Selling ${itemName} via ${mode}...`);
        button.click();

        const postSellState = await waitForPostSellChange(button);
        if (!postSellState) {
            state.failed += 1;
            setDetail(`Timed out after clicking ${mode} for ${itemName}`);
            addProtocolRow({
                index: index + 1,
                item: itemName,
                result: "Post-sell timeout"
            });
            return { shouldDelay };
        }

        state.sold += 1;
        setDetail(`Triggered ${mode} for ${itemName}`);
        addProtocolRow({
            index: index + 1,
            item: itemName,
            result: postSellState === "button-disappeared"
                ? `AS ${mode} clicked`
                : `AS ${mode}: ${postSellState}`
        });
        await sleepWithProgress(CONFIG.postSellSettledDelayMs, "Waiting for sell UI to settle");
        return { shouldDelay };
    }

    async function processMarketListing(row, index) {
        state.currentIndex = index + 1;
        updateState(`Removing listing ${state.currentIndex}/${state.total}`);

        const itemName = getActiveListingName(row);
        const removeButton = getActiveListingRemoveButton(row);
        if (!removeButton) {
            state.skipped += 1;
            setDetail(`Skipped listing without Remove button: ${itemName}`);
            addProtocolRow({
                index: index + 1,
                item: itemName,
                result: "No Remove button"
            });
            return { shouldDelay: false };
        }

        const previousTotal = getActiveListingsTotal();
        setDetail(`Removing listing: ${itemName}`);
        removeButton.click();

        const didConfirm = await confirmMarketRemoveDialog();
        if (!didConfirm) {
            state.failed += 1;
            setDetail(`Timed out waiting for removal confirmation for ${itemName}`);
            addProtocolRow({
                index: index + 1,
                item: itemName,
                result: "Confirm dialog timeout"
            });
            return { shouldDelay: true };
        }

        const removalState = await waitForMarketRemoveChange(row, previousTotal);
        if (!removalState) {
            state.failed += 1;
            setDetail(`Timed out while removing ${itemName}`);
            addProtocolRow({
                index: index + 1,
                item: itemName,
                result: "Remove timeout"
            });
            return { shouldDelay: true };
        }

        state.sold += 1;
        setDetail(`Removed listing: ${itemName}`);
        addProtocolRow({
            index: index + 1,
            item: itemName,
            result: removalState === "count-decreased"
                ? "Listing removed"
                : `Listing removed: ${removalState}`
        });
        await sleepWithProgress(CONFIG.marketRemoveDelayMs, "Waiting for market list to settle");
        return { shouldDelay: false };
    }

    async function startRun() {
        if (state.running) {
            return;
        }

        if (!isInventoryPage()) {
            updateState("Inventory page required.");
            setDetail("Open your Steam inventory page to use Sell Visible Cards.");
            return;
        }

        const items = getVisibleInventoryItems();
        if (items.length === 0) {
            updateState("No visible inventory items found.");
            setDetail("Open a populated inventory page before starting.");
            return;
        }

        resetRunState();
        state.running = true;
        state.total = items.length;
        updateState(`Starting batch for ${items.length} visible items.`);
        setDetail("Collecting item details...");

        try {
            for (let index = 0; index < items.length; index += 1) {
                if (state.stopRequested) {
                    break;
                }

                const result = await processItem(items[index], index);
                updateState();

                if (state.stopRequested || index === items.length - 1) {
                    continue;
                }

                if (!result?.shouldDelay) {
                    continue;
                }

                await sleepWithProgress(CONFIG.interItemDelayMs, "Waiting before next item");
            }
        } catch (caught) {
            state.failed += 1;
            setDetail(`Unexpected error: ${caught instanceof Error ? caught.message : String(caught)}`);
        } finally {
            state.running = false;
            setSleepProgress(false, 0, "");

            const completionMessage = state.stopRequested
                ? "Run stopped."
                : "Run finished.";

            updateState(completionMessage);
            setDetail(`${completionMessage} Sold ${state.sold}, skipped ${state.skipped}, failed ${state.failed}.`);
        }
    }

    async function startRemoveListingsRun() {
        if (state.running) {
            return;
        }

        if (!isMarketPage()) {
            updateState("Market page required.");
            setDetail("Open https://steamcommunity.com/market/ to use Remove Active Listings.");
            return;
        }

        const totalListings = getActiveListingsTotal();
        if (totalListings === 0) {
            updateState("No active listings found.");
            setDetail("Open the market home page with active sell listings before starting.");
            return;
        }

        resetRunState();
        state.running = true;
        state.total = totalListings;
        updateState(`Starting removal for ${state.total} active listings.`);
        setDetail("Collecting active listings...");

        try {
            while (!state.stopRequested) {
                const rows = getActiveListingsRows();
                if (rows.length === 0) {
                    break;
                }

                const row = rows[0];
                await processMarketListing(row, state.sold + state.skipped + state.failed);
                updateState();

                if (state.stopRequested) {
                    break;
                }

                const remainingRows = getActiveListingsRows();
                if (remainingRows.length > 0) {
                    continue;
                }

                const nextButton = getActiveListingsNextButton();
                if (!nextButton) {
                    break;
                }

                const previousMarker = getActiveListingsPageMarker();
                setDetail("Opening next listings page...");
                nextButton.click();
                const nextMarker = await waitForMarketPageChange(previousMarker);
                if (!nextMarker) {
                    state.failed += 1;
                    addProtocolRow({
                        index: state.sold + state.skipped + state.failed,
                        item: "Listings pager",
                        result: "Next page timeout"
                    });
                    setDetail("Timed out while opening the next listings page.");
                    break;
                }
                await sleepWithProgress(CONFIG.marketPageChangeDelayMs, "Waiting for next listings page");
            }
        } catch (caught) {
            state.failed += 1;
            setDetail(`Unexpected error: ${caught instanceof Error ? caught.message : String(caught)}`);
        } finally {
            state.running = false;
            setSleepProgress(false, 0, "");

            const completionMessage = state.stopRequested
                ? "Removal stopped."
                : "Removal finished.";

            updateState(completionMessage);
            setDetail(`${completionMessage} Removed ${state.sold}, skipped ${state.skipped}, failed ${state.failed}.`);
        }
    }

    // =========================================================================
    // Bootstrap And Debug Hooks
    // =========================================================================

    function bootstrap() {
        createWidget();
        updateMaxPriceCurrencyDisplay();
        updateWidgetForCurrentPage();

        window.asBulkSeller = {
            config: CONFIG,
            state,
            start: () => void startRun(),
            removeListings: () => void startRemoveListingsRun(),
            stop: () => requestStop("Stop requested from console."),
            getPageMode,
            getVisibleInventoryItems,
            getActiveListingsRows,
            getActiveItemInfoPanel,
            getSellButtons
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
    } else {
        bootstrap();
    }
})();