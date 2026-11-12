# ATC backend deploy checklist

1. **Back up the sheet.** In Google Sheets, right-click each tab and choose **Copy to → New sheet**. Rename the copies `BAK_<name>_YYYYMMDD`. Back up `Signups`, `Results`, `Emails`, and `BoardNotes`; `Actions` and `Invoices` are empty and optional.
2. **Paste the source.** Open the existing Apps Script project and replace the contents of all five files with `apps-script/Code.gs`, `apps-script/dashboard.gs`, `apps-script/Hr.gs`, `apps-script/uni.gs`, and `apps-script/Setup.gs`.
3. **Audit headers.** Run `setupDatabaseOnce()` from the editor and inspect **View → Logs**. Confirm there are no `APPENDED` lines and every existing tab reports `OK`.
4. **Deploy a new version of the existing deployment.** Choose **Deploy → Manage deployments → Edit existing**, select **Version: New version**, then click **Deploy**. Do not create a new deployment; keep the existing URL.
5. **Verify the POST routes in the editor console**, running each line separately in a temporary function:

   ```js
   Logger.log(doPost({ postData: { contents: JSON.stringify({ type: 'dashboard_read', key: 'atc-tn-2026-7Q4m' }) } }).getContent());
   Logger.log(doPost({ postData: { contents: JSON.stringify({ type: 'hr_read',        key: 'atc-tn-2026-7Q4m' }) } }).getContent());
   Logger.log(doPost({ postData: { contents: JSON.stringify({ type: 'dashboard_read', key: 'wrong'              }) } }).getContent());
   ```

   Expect `{ok:true, ...}` for the first two calls and `{ok:false, error:'Unauthorized'}` for the third.
6. **Rotate the frontend password only after verification succeeds.** Change `STAFF_PASSWORD` in `app/assets/js/config.js` to `atc-tn-2026-7Q4m`, then commit and push that change. This is the final step so frontend and backend credentials rotate together.
