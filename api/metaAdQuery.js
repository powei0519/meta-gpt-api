const axios = require("axios");

module.exports = async (req, res) => {
  // 設定 CORS 頭以允許跨域請求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 處理 OPTIONS 請求（預檢請求）
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('開始請求 Meta Ad Summary API...');
    
    const response = await axios.get(
      "https://metaadsummary-hmlepmpdwq-uc.a.run.app/metaAdSummary",
      {
        timeout: 30000 // 設置 30 秒超時
      }
    );

    // 確保 API 回應有效
    if (!response || !response.data) {
      throw new Error('Meta API 回傳空數據');
    }

    console.log('成功取得 Meta API 回應');
    
    const data = response.data;
    const today = data.date_range?.until || new Date().toISOString().slice(0, 10);
    
    // 輸出原始資料的簡短摘要，幫助除錯
    console.log(`日期範圍: ${today}`);
    console.log(`帳戶數量: ${data.accounts?.length || 0}`);
    
    if (!data.accounts || !Array.isArray(data.accounts) || data.accounts.length === 0) {
      console.warn('沒有找到帳戶資料或帳戶陣列為空');
      return res.status(200).json({
        date: today,
        message: "No account data found"
      });
    }

    let totalSpend = 0;
    let totalActions = 0;
    let totalRoas = 0;
    let adsets = [];
    let adsetCount = 0; // 用於計算有效的廣告組數量

    // 處理每個帳戶
    data.accounts.forEach((account, accountIndex) => {
      if (!account) {
        console.warn(`跳過索引 ${accountIndex}: 帳戶資料為 null 或 undefined`);
        return;
      }
      
      if (!account.adsets || !Array.isArray(account.adsets)) {
        console.warn(`帳戶 ${account.name || accountIndex} 沒有廣告組資料或格式不正確`);
        return;
      }
      
      console.log(`處理帳戶 "${account.name || '未命名'}" 的 ${account.adsets.length} 個廣告組`);

      // 處理每個廣告組
      account.adsets.forEach((ad, adIndex) => {
        try {
          if (!ad) {
            console.warn(`帳戶 ${account.name || accountIndex} 中索引 ${adIndex} 的廣告組資料無效`);
            return;
          }
          
          // 安全地解析支出金額
          const spend = parseFloat(ad.spend || 0) || 0;
          if (isNaN(spend)) {
            console.warn(`廣告組 "${ad.adset_name || ad.name || adIndex}" 的支出金額無效: ${ad.spend}`);
          }

          // 處理 actions 陣列，找出 purchase 數量
          let purchaseActions = 0;
          if (Array.isArray(ad.actions)) {
            const purchaseAction = ad.actions.find(
              (a) => a && a.action_type === "purchase"
            );
            if (purchaseAction && purchaseAction.value) {
              purchaseActions = parseInt(purchaseAction.value) || 0;
              if (isNaN(purchaseActions)) {
                console.warn(`廣告組 "${ad.adset_name || ad.name || adIndex}" 的 purchase 數值無效: ${purchaseAction.value}`);
                purchaseActions = 0;
              }
            }
          } else {
            console.log(`廣告組 "${ad.adset_name || ad.name || adIndex}" 沒有 actions 陣列`);
          }

          // 處理 ROAS 數據
          let roas = 0;
          if (Array.isArray(ad.purchase_roas) && ad.purchase_roas.length > 0) {
            // 確保 purchase_roas 陣列的第一個元素存在且有 value 屬性
            if (ad.purchase_roas[0] && ad.purchase_roas[0].value !== undefined) {
              roas = parseFloat(ad.purchase_roas[0].value) || 0;
              if (isNaN(roas)) {
                console.warn(`廣告組 "${ad.adset_name || ad.name || adIndex}" 的 ROAS 數值無效: ${ad.purchase_roas[0].value}`);
                roas = 0;
              }
            }
          } else {
            console.log(`廣告組 "${ad.adset_name || ad.name || adIndex}" 沒有 purchase_roas 陣列或為空`);
          }

          // 計算 CPA (避免除以零)
          const cpa = purchaseActions > 0 ? spend / purchaseActions : 9999;

          // 累計總數
          totalSpend += spend;
          totalActions += purchaseActions;
          
          // 當 ROAS 有效時才計入總數
          if (roas > 0) {
            totalRoas += roas;
            adsetCount++;
          }

          // 將處理後的廣告組資料加入陣列
          adsets.push({
            name: ad.adset_name || ad.name || `Unknown-${adIndex}`,
            spend,
            actions: purchaseActions,
            cpa: cpa,
            roas: roas
          });
          
          console.log(`成功處理廣告組 "${ad.adset_name || ad.name || adIndex}" (Spend: ${spend}, Actions: ${purchaseActions}, ROAS: ${roas})`);
        } catch (innerError) {
          console.error(`處理廣告組時發生錯誤:`, innerError.message);
          console.error(`問題廣告組資料:`, JSON.stringify(ad, null, 2).substring(0, 500));
        }
      });
    });

    // 檢查是否有處理到任何廣告組
    if (adsets.length === 0) {
      console.warn('沒有找到任何有效的廣告組');
      return res.status(200).json({
        date: today,
        message: "No adset data found"
      });
    }

    console.log(`成功處理 ${adsets.length} 個廣告組`);

    // 找出最佳廣告組 (按 ROAS 排序)
    adsets.sort((a, b) => b.roas - a.roas);
    const best = adsets[0];
    
    // 找出最差廣告組 (按 CPA 排序)
    // 過濾掉沒有轉換的廣告組 (CPA = 9999)
    const adsetsWithConversions = adsets.filter(ad => ad.actions > 0);
    let worst = null;
    
    if (adsetsWithConversions.length > 0) {
      adsetsWithConversions.sort((a, b) => b.cpa - a.cpa);
      worst = adsetsWithConversions[0];
    } else {
      worst = { name: "N/A", cpa: 0 };
    }

    // 計算平均 ROAS
    const avgRoas = adsetCount > 0 ? Math.round((totalRoas / adsetCount) * 100) / 100 : 0;

    // 構建最終結果
    const summary = {
      date: today,
      spend: Math.round(totalSpend),
      cpa: totalActions > 0 ? Math.round(totalSpend / totalActions) : null,
      roas: avgRoas,
      best_adset: `${best.name}（ROAS ${best.roas.toFixed(2)}）`,
      worst_adset: `${worst.name}（CPA ${Math.round(worst.cpa)}）`
    };

    console.log(`API 處理完成，返回摘要結果:`, summary);

    res.status(200).json(summary);
  } catch (error) {
    console.error("MetaAdQuery 錯誤:", error.message);
    console.error("錯誤堆疊:", error.stack);
    res.status(500).json({ 
      error: "廣告資料獲取或處理失敗",
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
