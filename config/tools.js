const bcrypt = require('bcryptjs');
const fs = require("fs");
const jwt = require('jsonwebtoken')
const md5 = require('md5')
const keys = require('./keys')

// bcryrpt同步加密密码
exports.enbcrypt = (password) => {
	var salt = bcrypt.genSaltSync(10);
	var hash = bcrypt.hashSync(password, salt);
	return hash;
}
// 生成 6 位随机验证码
exports.getSMSCode = () => {
	const smsCode = (Math.random() + "").substring(2,8);
	if (smsCode[0] === '0') {
		return exports.getSMSCode();
	}else {
		return smsCode;
	}
}
// 转换手机号(手机号脱敏)
exports.transPhone = (p) => {
	if (typeof(p) !== 'string')	
		return p
	return (p[0] + p[1] + p[2] + '****' + p[7] + p[8] + p[9] + p[10]);
}

// 转换身份证(身份证脱敏)
exports.transIDCard = (id) => { 
	if (typeof(id) !== 'string')	
		return id
	return id.substring(0,3) + '****' + id.substring(14)
}
// 转换邮箱(邮箱脱敏)
exports.transEmail = (email) => {
	if (typeof(email) !== 'string')	
		return email
	var tit = email.match(/^\w+(?=@)/g)
	if (!tit) return email;
	return email.replace(/^\w+(?=@)/g, tit[0][0] + "***" + tit[0][tit[0].length-1])
}


// 文件读取
exports.readFile = (url) => {
	return new Promise((resolve, reject) => {
		fs.readFile(url, (err, data) => {
			if (err) reject(err);
			resolve(data);
		});
	});
}


// 文件移动
exports.moveFile = (before, next, callback) => new Promise((resolve, reject) => {
	const rs = fs.createReadStream(before)
	const ws = fs.createWriteStream(next)
	rs.pipe(ws)  // 管道移动文件
	rs.on('close', function() {
		// 删除缓存的文件
		fs.unlink(before, (err) => {
			if (err) {console.error('moveFile/rmfile', err.message)}
		})
		// 移动成功
		if (typeof(callback) === 'function')
			callback(null, next)
		resolve(next)
	})

	// 移动失败
	rs.on('error', (err) => {
		console.error('moveFile/readerStream', err)
	   	if (typeof(callback) === 'function')
			callback(err)
		reject(err)
	})
	ws.on('error', (err) => {
		console.error('moveFile/writeStream', err)
	   	if (typeof(callback) === 'function')
			callback(err)
		reject(err)
	})
})

// 生成文件名
exports.randomStr = (length) => {
	const len = length || 10
	const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
	let baseName = ''
	for (let i = 0; i < len; i++) {
		baseName += chars[Math.floor(Math.random() * 62)]
	}
	return function getImgName(fileName) {
		let ext = /(.jpg|.jpeg|.png|.svg|.gif)(?=\b$)/i.exec(fileName)
		return baseName + '_' + (Math.random() + "").substring(2,10) + (ext ? ext[0] : '.jpg')
	}
}

// 生成 number(订货编号)函数，18位
exports.getOrderno = (function() {
	let count = Number(exports.getSMSCode().substring(0, 5))
	return () => {
        count = count + Math.floor(9 * Math.random()) +1
       	if (count > 99999) { count = Number(exports.getSMSCode().substring(0, 5)) }
	    return `${Date.now()}${count}`
	}
}())

// 转移搜索关键字，防止 SQL 注入
exports.transKeyword = (keyword) => {
	if (typeof(keyword) !== 'string') return null;
	return keyword.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/_/g, '\\_')
}

exports.formatDate = () => {
	let date = new Date()
    let y = date.getFullYear();  
    let m = date.getMonth() + 1
    m = m < 10 ? ('0' + m) : m
    let d = date.getDate()
    d = d < 10 ? ('0' + d) : d
    let h = date.getHours()
    let minute = date.getMinutes(); 
    minute = minute < 10 ? ('0' + minute) : minute
    return y + '-' + m + '-' + d+' '+h+':'+minute
}

// 获取 ip 地址
exports.getIPAddress = (ctx) => {
	return ctx.req.headers['x-forwarded-for'] ||
		ctx.req.connection.remoteAddress ||
		ctx.req.socket.remoteAddress ||
		(ctx.req.connection.socket && ctx.req.connection.socket.remoteAddress) || null
}

/**
 * 获取 tokne
 * @param  {[object]} payload [token 负载]
 * @param  {[object]} ctx     [koa 上下文，用于获取 ip 地址]
 */
exports.getToken = (payload, ctx) => {
	const ip = md5(exports.getIPAddress(ctx) + keys.tokenKey).substring(11, 24)
	return jwt.sign({...payload, ip}, keys.tokenKey, {expiresIn: 60*20})  // 重新签发 token
}
