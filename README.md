# YULO Cafe Billing

Billing app for YULO CAFE: Android tablet (Chrome) + EZO 58D thermal printer (Bluetooth or USB).
Works without internet after the first opening. No subscription, no server: bills are stored on the tablet.

## Put it online (once, on a computer)
1. In the GitHub repository `yulo-pos`: **Add file > Upload files**.
2. Drag in **everything inside the unzipped folder** (index.html, sw.js, manifest.webmanifest, README.md and the `js` and `icons` folders). Click **Commit changes**.
3. **Settings > Pages**: Branch **main**, folder **/(root)**, **Save**. Wait 2 minutes.
4. The app is at **https://vayucodes.github.io/yulo-pos/**

## Install on the tablet (once, with Wi-Fi)
1. Open the link above in **Google Chrome**.
2. Chrome menu (three dots) > **Add to Home screen** > **Install**.
3. Open **YULO Billing** from the home screen. From now on it works with or without Wi-Fi.
4. Settings > Printer > **Connect printer** > choose **EZO PRINTER** > **Test print**.

## Daily use
- **Billing**: tap a category, tap items. Use + / − or tap the number to type a quantity. Water asks for the MRP.
- **Print Bill** saves the bill first, then prints. The bill is kept even if printing fails.
- If it says **NOT printed**: do not charge again. Fix the printer (on? paper?), tap **Connect printer** if shown, then **Retry print**.
- **New Bill** returns to an empty bill.
- **Clear bill** empties a bill that is not yet printed (no number is used).
- **Bills**: find any bill by date, number or item. **Reprint** (marked REPRINT) or **Cancel bill** (kept in history, removed from totals).
- **Reports**: sales, bill count, average bill, sales by date and item-wise sales for any period.
- If the top-right button is red (**Printer not connected**), tap it and choose EZO PRINTER.

## Menu changes
**Menu** tab: tap an item to change its price, name or category, or untick *Show on the billing screen* to hide it.
**Add item** for new dishes. **Rename category** to rename a section. **Export CSV / Import CSV** to edit many items in a spreadsheet;
importing matches items by name, so it never creates duplicates, and shows what will change before applying.

## Bills folder (.txt files)
Settings > Bills folder > **Choose bills folder**: pick or create **YULO Bills** (if you pick another folder, YULO Bills is created inside it).
Every bill is then saved automatically as `YULO Bills/Months/October 2026/Bill#01_10-10-2026.txt` the moment it is made.
The file looks like the receipt; its last line (`#DATA ...`) lets the app read the bill back. Don't edit that line.
If Android asks again, a banner says **Allow folder access**: tap it and any waiting bills are saved.
If the app's data is ever cleared: Settings > **Choose bills folder** (same YULO Bills folder) > **Rebuild from folder**.
Bills, reports and bill numbering come back. Menu changes and settings come back only from a backup.

## Backup (do this every day)
Settings > Backup > **Send backup to Drive / WhatsApp** (or **Save backup to tablet**). A yellow banner reminds you if a day passes without one.
To recover: Settings > Backup > **Restore from backup** and pick the file.
**Warning:** clearing Chrome's data/storage for this app, or uninstalling Chrome, deletes all bills on the tablet. Only a backup can bring them back.

## Updates
When new files are uploaded to GitHub, the app shows **"A new version of the app is ready"** next time it opens with Wi-Fi.
Tap **Update now** (any unfinished bill is kept).

## Known limits
- The printer has no ₹ symbol, so receipts print "Rs.".
- The app cannot detect "paper finished" over Bluetooth; it can only tell when the printer is unreachable. Check the receipt came out.
- After the app is closed and reopened, Chrome may ask you to tap **Printer not connected** and choose EZO PRINTER again.

## For later: GST
GST is off. Tax is calculated only in `js/tax.js`, and every bill stores its own tax result, so GST can be added later
without changing old bills. Bill numbers are continuous (#01, #02, ...); the next number can be changed in Settings.
