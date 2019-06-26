const initOK = {
    success: true,
    code: '0000',
    message: 'ok',
    payload: null,
}
const initFail = {
    success: false,
    code: '0001',
    message: 'ok',
    payload: null,
}

module.exports = class Response {
    
    /**
     * 请求成功恢复对象
     * @param {} data 
     */
    static ok(data = {}) {
        data = {...initOK, ...data}
        return data
    }

    static fail(data = {}) {
        return {...initFail, ...data}
    }
}