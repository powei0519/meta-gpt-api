// 強化除錯版 metaAdQuery.js
const axios = require("axios");

module.exports = async (req, res) => {
  try {
    console.log("📥 開始呼叫 Firebase API...");
    const response = await axios.get(
      "https://metaadsummary-hmlepmpdwq-uc.a.run.app/metaAdSummary"
    );

    const data = response.data;
    console.log("✅ 成功取得資料，範例：", JSON.stringify(data?.accounts?.[0], null, 2));

    const today = data.date_range?.until || new Date().toISOString().slice(0, 10);

    let totalSpend = 0;
    let totalActions = 0;
    let totalRoas = 0;
    let adsets = [];

    if (!Array.isArray(data.accounts)) {
      throw new Error("資料錯誤：accounts 不是陣列");
    }

    data.accounts.forEach((account, i) => {
      if (!Array.isArray(account.adsets)) {
        console.warn(`⚠️ 帳號 ${i} 沒有 adsets 陣列`);
        return;
      }

      account.adsets.forEach((ad, j) => {
        try {
          const spend = parseFloat(ad?.spend || 0);

          // actions 處理
          let purchaseActions = 0;
          if (Array.isArray(ad.actions)) {
            const purchaseAction = ad.actions.find(
              (a) => a.action_type === "purchase"
            );
            if (purchaseAction?.value) {
              purchaseActions = parseInt(purchaseAction.value);
            }
          }

          // ROAS 處理
          let roas = 0;
          if (Array.isArray(ad.purchase_roas) && ad.purchase_roas[0]?.value) {
            roas = parseFloat(ad.purchase_roas[0].value);
          }

          adsets.push({
            name: ad.adset_name || ad.name || `Unknown_${i}_${j}`,
            spend,
            actions: purchaseActions,
            cpa: purchaseActions > 0 ? spend / purchaseActions : 9999,
            roas
          });

          totalSpend += spend;
          totalActions += purchaseActions;
          totalRoas += roas;

        } catch (innerErr) {
          console.error("❌ 處理某筆 adset 錯誤：", ad, innerErr);
        }
      });
    });

    if (adsets.length === 0) {
      return res.status(200).json({
        date: today,
        message: "沒有有效的廣告資料 adsets"
      });
    }

    adsets.sort((a, b) => b.roas - a.roas);
    const best = adsets[0];
    adsets.sort((a, b) => b.cpa - a.cpa);
    const worst = adsets[0];

    const summary = {
      date: today,
      spend: Math.round(totalSpend),
      cpa: totalActions > 0 ? Math.round(totalSpend / totalActions) : null,
      roas: Math.round((totalRoas / adsets.length) * 100) / 100,
      best_adset: `${best.name}（ROAS ${best.roas}）`,
      worst_adset: `${worst.name}（CPA ${Math.round(worst.cpa)}）`
    };

    console.log("📊 最終彙整結果：", summary);
    res.status(200).json(summary);
  } catch (error) {
    console.error("🔥 發生未捕捉錯誤：", error);
    res.status(500).json({ error: "發生錯誤，請查看 Vercel Logs" });
  }
};
