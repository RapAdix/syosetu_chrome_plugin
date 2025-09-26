function safeSetToStorage(
  data,
  onSuccess = () => {},
  onFailure = () => { alert('❌ Cache is full. Cannot save new data.'); },
  maxRetries = 3
) {
  attemptSet(data, onSuccess, onFailure, maxRetries);
}

function attemptSet(data, onSuccess, onFailure, remainingRetries) {
  chrome.storage.local.set(data, () => {
    if (chrome.runtime.lastError) {
      console.info(`⚠️ Storage write failed. Remaining retries: ${remainingRetries}`);

      if (remainingRetries <= 0) {
        console.error("❌ Failed to write even after trimming.");
        if (onFailure) onFailure();
        return;
      }

      trimJishoCache(() => {
        if (data.jisho_cache_list){
          chrome.storage.local.get("jisho_cache_list", (res) => {
            let list = res.jisho_cache_list || [];
            const keys = Object.keys(data);
            const cacheKey = keys.find(key => key !== 'jisho_cache_list');

            // Remove word if already in list (we’ll re-add it at front)
            list = list.filter((w) => w !== cacheKey);
            list.unshift(cacheKey); // Add to front (most recent)
            data.jisho_cache_list = list;
            attemptSet(data, onSuccess, onFailure, remainingRetries - 1);
          });
        } else {
          attemptSet(data, onSuccess, onFailure, remainingRetries - 1);
        }
      });
    } else {
      console.log("✅ Successfully saved.");
      if (onSuccess) onSuccess();
    }
  });
}

function trimJishoCache(callback) {
  chrome.storage.local.get("jisho_cache_list", (res) => {
    let list = res.jisho_cache_list || [];
    if (list.length === 0) {
      console.error("🚨 Jisho cache is already empty. Cannot trim further.");
      alert("❗ Cache full and no Jisho entries to delete.");
      if (callback) callback();
      return;
    }

    // Remove the oldest entry
    const cacheKeyToRemove = list.pop();

    chrome.storage.local.remove(cacheKeyToRemove, () => {
      chrome.storage.local.set({ jisho_cache_list: list }, () => {
        console.log(`🗑️ Removed oldest Jisho cache entry: ${cacheKeyToRemove}`);
        if (callback) callback();
      });
    });
  });
}