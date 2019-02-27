const jwt = require('jsonwebtoken')
const keys = require('../config/keys')

module.exports = (ctx) => {
	const token = ctx.request.header.authorization || ctx.request.body.token;
    if (!token) {
        return { isvalid: false, message: 'empty token' }
    }
	try {
		// 存在，解析
        const decoded = jwt.verify(token, keys.tokenKey)
		return { isvalid: true, payload: decoded }
	} catch(err) {
		// token 非法或过期都会报错
        return { isvalid: false, message: err.message }
    }
}