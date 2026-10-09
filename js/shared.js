(function (root) {
  'use strict';
  class SharedClient {
    constructor(url, storage) {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('请输入服务的根地址，例如 http://localhost:8787');
      if (parsed.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)) throw new Error('非本机共享服务必须使用 HTTPS');
      this.url = parsed.origin; this.storage = storage;
      this.key = 'campus-light-session:' + this.url;
      this.token = storage.getItem(this.key) || '';
    }
    async request(route, method = 'GET', data) {
      try {
        const response = await fetch(this.url + '/api' + route, {
          method, cache:'no-store', signal:AbortSignal.timeout(10000),
          headers: { ...(data ? {'Content-Type':'application/json'} : {}), ...(this.token ? {Authorization:'Bearer ' + this.token} : {}) },
          body: data ? JSON.stringify(data) : undefined
        });
        const result = await response.json();
        if (!response.ok) throw Object.assign(new Error(result.error || '操作失败，请重试'), { fields:result.fields, status:response.status });
        return result;
      } catch (error) {
        if (error.status) throw error;
        throw new Error('无法连接共享服务，请检查网络和服务地址；输入已保留');
      }
    }
    async connect() {
      const identity = await this.request('/session', 'POST', {});
      if (identity.token) { this.storage.setItem(this.key, identity.token); this.token = identity.token; }
      this.ownerId = identity.ownerId;
      return this.request('/items');
    }
  }
  root.SharedClient = SharedClient;
})(window);
