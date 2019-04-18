const jwt = require('jsonwebtoken')
const url = require('url')
const md5 = require('md5')
const keys = require('../config/keys')
const { getIPAddress } = require('../config/tools')

module.exports = (ctx, ip) => {
	let token;
	if (typeof(ctx) === 'string') {
		// get 请求将 token 放在url 中
		token = url.parse(ctx, true).query.token
	}else {
		token = ctx.request.header.authorization || ctx.request.body.token
	}
    if (!token) {
        return { isvalid: false, message: 'empty token' }
    }
	try {
		// 存在，解析
        const decoded = jwt.verify(token, keys.tokenKey)
        // 如果需要验证 ip 地址
        if (ip && md5(ip + keys.tokenKey).substring(11,24) !== decoded.ip) {
			return { isvalid: false, message: '您的IP地址发生改变，请重新登录' }
        }
		return { isvalid: true, payload: decoded }
	} catch(err) {
		// token 非法或过期都会报错
        return { isvalid: false, message: err.message }
    }
}