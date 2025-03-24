const axios = require("axios");

module.exports = async (req, res) => {
  try {
    const response = await axios.get(
      "https://metaadsummary-hmlepmpdwq-uc.a.run.app/metaAdSummary"
    );

    const data = response.data;
    const today = data.date_range?.until || new Date().toISOString().slice(0, 10);

    let totalSpend = 0;
    let totalActions = 0;
    let totalRoas = 0;
    let adsets = [];

    data.accounts?.forEach((account) => {
      if (!account.adsets || !Array.isArray(account.adsets)) return;

      account.adsets.forEach((ad) => {
        try {
          const spend = parseFloat(ad.spend || 0);

          // 處理 actions 陣列，找出 purchase 數量
          let purchaseActions = 0;
          if (Array.isArray(ad.actions)) {
            const purchaseAction = ad.actions.find(
              (a) => a.action_type === "purchase"
            );
            if (purchaseAction && purchaseAction.value) {
              purchaseActions = parseInt(purchaseAction.value);
            }
          }

          let roas = 0;
          if (Array.isArray(ad.purchase_roas) && ad.purchase_roas[0]?.value) {
            roas = parseFloat(ad.purchase_roas[0].value);
          }

          totalSpend += spend;
          totalActions += purchaseActions;
          totalRoas += roas || 0;

          adsets.push({
            name: ad.adset_name || ad.name || "Unknown",
            spend,
            actions: purchaseActions,
            cpa: purchaseActions > 0 ? spend / purchaseActions : 9999,
            roas: roas || 0
          });
        } catch (innerError) {
          console.error("Error processing ad entry:", ad, innerError);
        }
      });
    });

    if (adsets.length === 0) {
      return res.status(200).json({
        date: today,
        message: "No adset data found"
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

    res.status(200).json(summary);
  } catch (error) {
    console.error("MetaAdQuery Error:", error);
    res.status(500).json({ error: "Failed to fetch or process ad data." });
  }
};