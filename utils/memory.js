/**
 * 临时存储到内存中的键值对 Map，模拟 Redis
 * 问题：
 * 1. 重复添加键相同可过期元素时，waitExpires 中会重复叠加
 */

 class Memory {

    /**
     * 初始化静态变量
     */
     static init() {
        // 存储的集合对象
        this.map = new Map()

        // 存储等待过期数据的键
        this.waitExpires = []

        // 过期清理器的键
        this.expireInterval = -1
     }

     /**
      * 生成清理过期键的定时器
      */
     static generatorExpireCleaner() {
        this.expireInterval = setInterval(() => {
            const first = this.waitExpires[0]
            if (!first) {
                // 取消定时器
                clearInterval(this.expireInterval)
                this.expireInterval = -1
                return;
            }
            // 如果键已经过期
            if (Date.now() / 1000 >= first.expireTime) {
                // 键过期，从内存和等待过期键中移除
                this.map.delete(first.key)
                this.waitExpires.shift()
            }
        }, 1000)
     }

     /**
      * 将等待过期的键添加到 waitExpires 数组中
      * @param {等待过期的键} key 
      * @param {等待过期的时间, unix 时间戳} interval 
      */
     static expireCleaner(key, expireTime) {
         expireTime = parseInt(Date.now() / 1000) + expireTime
         // 如果定时器未启动，则启动定时器
        if (this.expireInterval == -1) {
            this.generatorExpireCleaner()
        }
        // 找比这个键过期时间大的一位
        const index = this.waitExpires.findIndex((i) => i.expireTime > expireTime)
        this.waitExpires.splice(index === -1 ? this.waitExpires.length : index, 0, {key, expireTime})
     }

     static set(key, value, expireTime) {
        if (expireTime) {
            this.expireCleaner(key, expireTime)
        }
        this.map.set(key, value)
     }

     static get(key) {
        return this.map.get(key)
     }

     /**
      * 移除键
      * @param {要移除的键} key 
      * @param {boolean 键是否在过期列表中} expire 
      */
     static delete(key, expire) {
        const ans = this.map.delete()
         if (expire && ans) {
            const index = this.waitExpires.findIndex((i) => i.key === key)
            if (index !== -1) {
                this.waitExpires.splice(index, 1)
            }
         }
         return ans
     }

     static has(key) {
        return this.map.has(key)
     }
 }

 Memory.init()

 module.exports = Memory