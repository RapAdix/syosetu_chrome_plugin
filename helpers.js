/*
 * Copyright 2025 Adrian Kucharczuk
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Additional Commercial Use Condition:
 * Commercial use of this software requires explicit permission from the author.
 * See LICENSE-COMMERCIAL.txt for details.
 */

let storageQueue = Promise.resolve();

function serializeStorageOperation(op) {
  storageQueue = storageQueue.then(op).catch(()=>{});
  return storageQueue;
}

function safeSetToStorageWithList(cacheKey, html) {
  if (!cacheKey.startsWith("jisho_cache_")) { // Safe check that there is a need to calculate the list
    safeSetToStorage({[cacheKey]: html});
  } else {
    serializeStorageOperation(() => 
      new Promise((resolve) => {
        chrome.storage.local.get("jisho_cache_list", (res) => {
          let list = res.jisho_cache_list || [];

          // Remove word if already in list (we’ll re-add it at front)
          list = list.filter((w) => w !== cacheKey);
          list.unshift(cacheKey); // Add to front (most recent)
          
          attemptSet({
              [cacheKey]: html,
              jisho_cache_list: list,
            },
            () => { console.log('💾 Cached response for:', cacheKey); resolve(); }, 
            () => { alert('❌ Cache is full. Cannot save new response.'); resolve(); },
            4
          );
        });
      })
    );
  }
}

function safeSetToStorage(
  data,
  onSuccess = () => {},
  onFailure = () => { alert('❌ Cache is full. Cannot save new data.'); },
  maxRetries = 4
) {
  serializeStorageOperation(() =>
    new Promise((resolve) => {
      attemptSet(
        data, 
        () => { onSuccess(); resolve(); }, 
        () => { onFailure(); resolve(); }, 
        maxRetries
      );
    })
  );
}

function attemptSet(data, onSuccess, onFailure, remainingRetries) {
  chrome.storage.local.set(data, async () => {
    if (chrome.runtime.lastError) {
      console.info(`Storage write failed, error: ${chrome.runtime.lastError.message}. Remaining retries: ${remainingRetries}`);

      if (remainingRetries === 2) {
        console.debug(`Performing tiding cause a lot of errors with cache`);
        await new Promise(tidyJishoList); // Two last chances for set. Maybe some desynchronized cache<->list so make a clear.
      }
      if (remainingRetries <= 0) {
        console.error("❌ Failed to save cache even after trimming.");
        if (onFailure) onFailure();
        return;
      }

      trimJishoCache(() => {
        if (data.jisho_cache_list){ // Then this is a set of a jisho result
          chrome.storage.local.get("jisho_cache_list", (res) => { // so we will need to update the list to reflect trimming  
            let list = res.jisho_cache_list || [];
            const keys = Object.keys(data);
            const cacheKey = keys.find(key => key !== 'jisho_cache_list');

            list = list.filter((w) => w !== cacheKey); // Remove word if already in list
            list.unshift(cacheKey); // Add to front (most recent)
            data = { ...data, jisho_cache_list: list };
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
    chrome.storage.local.get(cacheKeyToRemove, (res) => {
      if (!res.hasOwnProperty(cacheKeyToRemove)) {
        console.info(`⚠️ Warning: Trying to remove ${cacheKeyToRemove} but it is not in the memory.`)
      }
      chrome.storage.local.remove(cacheKeyToRemove, () => {
        chrome.storage.local.set({ jisho_cache_list: list }, () => {
          if (chrome.runtime.lastError) {
            console.warn(`⚠️ Replacing jisho_cache_list failed. Performing removal of headless cache.`);
            tidyJishoList(callback);
          } else {
            console.log(`🗑️ Removed oldest Jisho cache entry: ${cacheKeyToRemove}, list_length: ${list.length}`);
            if (callback) callback();
          }
        });
      });
    })
  });
}

// Unless I mutex all cache writes, there will always happen to be some detached cache results.
// But small amount is not a problem. There will be just a few more background calls.
// This function is for when there accumulates too many of them in the long span of the extension usage.
// Or in a case I update the extension and that or some previous bugs resulted in significantly desynchronized cache<->list  
function tidyJishoList(callback) {
  chrome.storage.local.get(null, (items) => {
    const keysForJisho = Object.keys(items)
            .filter(k => k.startsWith("jisho_cache_") && k != "jisho_cache_list");
    const list = items.jisho_cache_list || [];
    const headlessCache = keysForJisho.filter(k => !list.includes(k));

    chrome.storage.local.remove(headlessCache, () => {
      console.log(`While tidying removed ${headlessCache.length} forgotten caches`);
      console.debug(headlessCache);
      
      let newList = [];
      for (const key of list) {
        if (keysForJisho.includes(key)) {
          newList.push(key);
        }
      }
      const listsDiffer = newList.length !== list.length ||
                          newList.some((v, i) => v !== list[i]);
      if (listsDiffer) {
        chrome.storage.local.set({ jisho_cache_list: newList }, () => {
            if (chrome.runtime.lastError) {
              console.warn(`💥☠️ Replacing jisho_cache_list failed INSIDE the tidy-up. ` +
                `If you are still encountering cache issues please use the button "Clear Cache" in settings`);
              console.info(chrome.runtime.lastError);
            } else {
              console.log(`Tidied up the list, new list_length: ${newList.length}`);
            }
            if (callback) callback();
        });
      } else {
        if (callback) callback();
      }
    });
  })
}

function logJishoCacheSize() {
  function getSizeInKB(str) {
    return new Blob([str]).size / 1024;
  }

  chrome.storage.local.get(null, (items) => {
    let totalKB = 0;

    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith("jisho_cache_") && typeof value === "string") {
        totalKB += getSizeInKB(value);
      }
    }

    console.debug(`📦 Estimated cache size: ${totalKB.toFixed(2)} KB`);
  });
}