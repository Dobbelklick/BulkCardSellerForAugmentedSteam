# Bulk Seller for Augmented Steam

Small userscript for Steam inventories that batch-clicks Augmented Steam's sell buttons for the currently visible inventory page.

![Bulk Seller for Augmented Steam widget on a Steam inventory page](./Screenshot_20260417_162645.png)

The widget shows the current run state, counters, max price limit, and a protocol log for the active inventory page.

## What It Does

It processes up to 25 visible inventory items on the current Steam inventory page and, for each eligible trading card, triggers Augmented Steam's:

- `Quick Sell` or, if the button is not available, `Instant Sell`

It also shows a small control widget with:

- start and stop controls
- a max price cap for skipping more expensive items
- progress status
- a protocol log of sold, skipped, and failed items

## Requirements

This script does not work on its own.

It requires all of the following:

1. A userscript manager such as Violentmonkey or Tampermonkey.
2. The browser extension `Augmented Steam` installed and active.
3. Any page of your own Steam inventory that has visible marketable items.

## Important Limitations

### Augmented Steam Is Required

This script depends on sell controls injected by Augmented Steam into the Steam inventory UI.

Without Augmented Steam, the script has no sell buttons to click and will not function.

### Single Visible Inventory Page Only

This script only works on the currently visible inventory page in Steam's inventory pager.

That means:

- it does not automatically move to the next inventory page
- it does not process your full inventory in one run
- it only processes the items currently rendered on the active page

This way the script handles at most 25 visible items per run.

### Trading Cards Only

The script is intended for Steam trading cards and skips non-card items when the item metadata clearly identifies them as something else.
It won't sell guns skins, avatars, or whatever else may appear in a Steam inventory.

### No Native Steam Selling Logic

This script does not implement its own selling workflow against Steam directly.
It only automates the Augmented Steam controls already present in the inventory panel.
It's an extension for an extension.

## How To Use

1. Install `Augmented Steam`.
2. Install this userscript in your userscript manager.
3. Open your Steam inventory page: https://steamcommunity.com/id/USERNAME/inventory
4. Make sure the inventory page you want to process is the currently visible one. (Don't worry, again, it won't sell anything but cheap cards)
5. Wait for the Augmented Steam sell controls to appear when selecting marketable cards.
6. Use the widget in the top-right corner and click `Sell Visible Cards`.

## Safety Notes

- Review the max price threshold before starting a run.
- Watch the protocol log for skipped or failed items.
- Test on a small page first before using it repeatedly.
- You can stop the script at any moment with its 'Stop' button or by simply closing the page.
- It will not start by itself.
- Steam inventory and market UI behavior can change over time, which may break the script.

## Matching Pages

The script runs on:

- `https://steamcommunity.com/id/*/inventory*`
- `https://steamcommunity.com/profiles/*/inventory*`

## File

The main userscript is:

- [bulk-card-seller-for-augmented-steam.user.js](./bulk-card-seller-for-augmented-steam.user.js)