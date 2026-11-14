window.APP = window.APP || {};

(function (APP) {
  'use strict';

  var DB_NAME = 'pokedex-photos';
  var STORE = 'photos';
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
    return dbPromise;
  }

  function put(id, dataUrl) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(dataUrl, id);
        tx.oncomplete = function () {
          resolve(id);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function get(id) {
    if (!id) return Promise.resolve(null);
    return open().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          resolve(null);
        };
      });
    });
  }

  function compress(file, callback) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1000;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = function () {
        callback(null);
      };
      img.src = reader.result;
    };
    reader.onerror = function () {
      callback(null);
    };
    reader.readAsDataURL(file);
  }

  // 新照片 id：优先用标准 UUID（服务端按 id 存文件），老 WebView 用时间戳+随机数兜底
  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch (e) { /* 继续走兜底 */ }
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  // 展示源：本地 IndexedDB 优先；本地没有（换设备/清过缓存）则由同步层从云端取
  function src(id) {
    if (APP.sync && APP.sync.photoSrc) return APP.sync.photoSrc(id);
    return get(id);
  }

  APP.photos = {
    put: put,
    get: get,
    src: src,
    newId: newId,
    compress: compress
  };
})(window.APP);
