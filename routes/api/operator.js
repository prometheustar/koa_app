/**
 * 业务路由
 */
const Router = require('koa-router');
const router = new Router();
const md5 = require('md5');
const path = require('path')
const fs = require('fs')
const koaBody = require('koa-body')
const tools = require('../../config/tools');
const validator = require('../../validation/validator');
const SMS = require('../../config/SMS');
const db = require('../../config/mysqldb.js');
const keys = require('../../config/keys.js');
const { moveFile } = require('../../config/tools')
const tokenValidator = require('../../validation/tokenValidator')


/**
 * @route POST api/operator/sms
 * @desc 发送短信验证码，返回验证码
 * @access 公开
 * 
 */
router.post('/sms', async ctx => {
	const phone = ctx.request.body.phone;
	if (!validator.isPhone(phone)){
		ctx.status = 400;
		return ctx.body = {success: false, code: '1004',message: '手机号码无效'}
	}
	try {
		// 查询是否重复发送
		const repeat = await db.executeReader(`select smsCode from member_sms where phone='${phone}' and date_add(now(),interval -50 second) < creaTime and creaTime=(select max(creaTime) from member_sms where phone='${phone}' order by creaTime desc);`)
		if (repeat.length > 0) {
			return ctx.body = {success: false, message: '1分钟内只能发送一次'}
		}

		const smsCode = tools.getSMSCode();
		// md5 加密
		const md5sms = md5(md5(smsCode + keys.secretOrKey) + phone);
		// 加密数据存入数据库
		const ans = await db.executeNoQuery(`insert into member_sms(phone,smsCode) values('${phone}', '${md5sms}');`)
		if (ans !== 1) { return {success: false, message: '未知错误'}}
			// 存入数据库成功，发送短信
		const res = await SMS(phone, smsCode)
		ctx.status = 200;
		ctx.body = {success:true, code:'0000', message:'OK'}

	}catch (err) {
		console.error('/api/operator/sms', err.message)
		ctx.status = 400;
		ctx.body = {success: false, code: '9999', message: err.message }
	}
})

router.post('/testsms', async ctx => {
	const phone = ctx.request.body.phone;
	if (!validator.isPhone(phone)){
		// ctx.status = 400;
		return ctx.body = {success: false, code: '1004',message: '手机号码无效'}
	}
	try {
		// 查询是否重复发送
		const repeat = await db.executeReader(`select smsCode from member_sms where phone='${phone}' and date_add(now(),interval -50 second) < creaTime and creaTime=(select max(creaTime) from member_sms where phone='${phone}' order by creaTime desc);`)
		if (repeat.length > 0) {
			return ctx.body = {success: false, message: '1分钟内只能发送一次'}
		}

		const smsCode = tools.getSMSCode();
		// md5 加密
		const md5sms = md5(md5(smsCode + keys.secretOrKey) + phone);
		// 加密数据存入数据库
		const ans = await db.executeNoQuery(`insert into member_sms(phone,smsCode) values('${phone}', '${md5sms}');`)
		if (ans !== 1) { return {success: false, message: '未知错误'}}

		ctx.status = 200;
		ctx.body = {success:true, code:'0000', message:'OK', smsCode: smsCode}

	}catch (err) {
		console.error('/api/operator/testsms(post)', err.message)
		ctx.status = 400;
		ctx.body = {success: false, code: '9999', message: err.message }
	}
})

router.get('/testsms', async ctx => {
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = ctx.body = {success: false, code: '1004', message: '请登录后操作'}
	}
	try {
		const user = await db.executeReader(`select phone from tb_member where _id=${token.payload.userId};`)
		const phone = user[0].phone
		// 查询是否重复发送
		const repeat = await db.executeReader(`select smsCode from member_sms where phone='${phone}' and date_add(now(),interval -50 second) < creaTime and creaTime=(select max(creaTime) from member_sms where phone='${phone}' order by creaTime desc);`)
		if (repeat.length > 0) {
			return ctx.body = {success: false, message: '1分钟内只能发送一次'}
		}
		const smsCode = tools.getSMSCode();
		// md5 加密
		const md5sms = md5(md5(smsCode + keys.secretOrKey) + phone);
		// 加密数据存入数据库
		const ans = await db.executeNoQuery(`insert into member_sms(phone,smsCode) values('${phone}', '${md5sms}');`)
		if (ans !== 1) { return {success: false, message: '未知错误'}}

		ctx.status = 200;
		ctx.body = {success:true, code:'0000', message:'OK', payload: {smsCode: smsCode}}

	}catch (err) {
		console.error('/api/operator/testsms(get)', err.message)
		ctx.status = 400;
		ctx.body = {success: false, code: '9999', message: err.message }
	}
})




// 文件上传测试
// function readFile(url) {
// 	return new Promise((resolve, reject) => {
// 		fs.readFile(url, 'utf-8', (err, data) => {
// 			if (err) {
// 				reject(err)
// 			}
// 			resolve(data)
// 		})
// 	})
// }

// // 文件上传到 linux 工具
// router.get('/files', async ctx => {
// 	ctx.body = await readFile(path.join(__dirname, '../../views/files.html'))
// })
// router.post('/files', koaBody({ multipart: true }), async ctx => {
// 	if (ctx.request.body.password !== '123456') {
// 		return ctx.body = { success: false, message: '密码错误' }
// 	}
// 	if (!ctx.request.files.file || typeof(ctx.request.files.file.path) !== 'string') {
// 		return ctx.body = { success: false, message: '文件未缓存' }
// 	}
// 	// 上传到服务器的文件会缓存到 用户目录/AppData/Local/Temp 目录
// 	const filePath = ctx.request.files.file.path
// 	const fileName = ctx.request.files.file.name
// 	try {
// 		const ans = await moveFile(filePath, path.join(__dirname, '../../files') + "/" + fileName);
// 		ctx.body = { success: true, code: '0000', message: ans }
// 	}catch (err) {
// 		console.error('/api/operator/files', err.message)
// 		ctx.body = { success: false, code:'9999', message: err.message }
// 	}
	
// })

module.exports = router.routes();