const bcrypt = require('bcryptjs');
const fs = require("fs");

// bcryrpt同步加密密码
function enbcrypt(password) {
	var salt = bcrypt.genSaltSync(10);
	var hash = bcrypt.hashSync(password, salt);
	return hash;
}
// 生成 6 位随机验证码
function getSMSCode() {
	const smsCode = (Math.random() + "").substring(2,8);
	if (smsCode[0] === '0') {
		return this.getSMSCode();
	}else {
		return smsCode;
	}
}
// 转换手机号
function transPhone(p) {
	return (p[0] + p[1] + p[2] + '****' + p[7] + p[8] + p[9] + p[10]);
}
// 文件读取
function readFile(url) {
	return new Promise((resolve, reject) => {
		fs.readFile(url, (err, data) => {
			if (err) reject(err);
			resolve(data);
		});
	});
}
// 文件移动
function moveFile(before, next) {
	return new Promise((resolve, reject) => {
		// 创建可读流
		var readerStream = fs.createReadStream(before)
		var writeStream = fs.createWriteStream(next)
		let buf = Buffer.alloc(0)
		readerStream.on('data', (chunk) => {
			writeStream.write(chunk)
			buf = Buffer.concat([buf,chunk], buf.length + chunk.length)
		})
		readerStream.on('end',function() {
			// 标记文件结尾
		   writeStream.end()
		   // 删除缓存的文件
		   fs.unlink(before, (err) => {
				if (err) {console.error('rmfile', err.message)}
		   })
		   resolve(buf);
		});

		readerStream.on('error', (err) => {
			reject(err)
		})
		writeStream.on('error', (err) => {
			reject(err)
		})
	})
}
// 生成文件名
function randomStr(length) {
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
module.exports = {
	enbcrypt,
	getSMSCode,
	transPhone,
	readFile,
	moveFile,
	randomStr
}