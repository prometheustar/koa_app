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

/**
 * @route POST api/operator/sms
 * @desc 发送短信验证码，返回验证码
 * @access 公开
 */
router.post('/sms', async ctx => {
	const phone = ctx.request.body.phone;
	console.log(ctx.request.body);
	if (!validator.isPhone(phone)){
		ctx.status = 400;
		ctx.body = {
			success: false,
			code: '1004',
			msg: 'Failed',
			error: '手机号码无效'
		}
		return;
	}
	// 验证码不能以 0 开头
	const smsCode = tools.getSMSCode();
	// md5 加密
	const md5sms = md5(md5(smsCode + keys.secretOrKey) + phone);
	// 加密数据存入数据库
	try {
		const ans = await db.executeNoQuery(`insert into member_sms(phone,smsCode) values('${phone}', '${md5sms}');`)
		if (ans === 1) {
			// 存入数据库成功，发送短信
			await SMS(phone, smsCode)
				.then(res => {
					// 发送成功
					ctx.status = 200;
					ctx.body = {success:true, code:'0000', msg:'OK', payload:{
							smsCode: smsCode
						}
					}
				})
				.catch(err => {
					ctx.status = 400;
					ctx.body = {
						success: false,
						code: '0002',
						msg: 'Fail',
						error: err.data.Message
					}
					console.log('/sms', err.message);
				});
		}
	}catch (err) {
		console.error('/api/operator/sms', err.message)
		ctx.status = 400;
		ctx.body = {success: false, code: '9999', msg: 'Fail', error: err.message }
	}
})

router.post('/testsms', async ctx => {
	const phone = ctx.request.body.phone;
	if (!validator.isPhone(phone)){
		ctx.status = 400;
		ctx.body = {
			success: false,
			code: '1004',
			msg: 'Failed',
			error: '手机号码无效'
		}
		return;
	}
	// 验证码不能以 0 开头
	const smsCode = tools.getSMSCode();
	// md5 加密
	const md5sms = md5(md5(smsCode + keys.secretOrKey) + phone);
	// 加密数据存入数据库
	await db.executeNoQuery(`insert into member_sms(phone,smsCode) values('${phone}', '${md5sms}');`)
		.then(ans => {
			if (ans !== 1) {
				ctx.status = 400;
				ctx.body = {success: false, code: '0002', msg: 'Failed'}
			}else {
				// 发送成功
				ctx.status = 200;
				ctx.body = {success:true, code:'0000', msg:'OK', payload:{smsCode: smsCode}}
			}
		})
		.catch(err => {
			console.error('/api/operator/testsms', err.message);
			ctx.status = 400;
			ctx.body = {
				success: false,
				code: '0002',
				msg: 'Fail',
				error: err.message
			}
		});
})

// 文件上传测试
function readFile(url) {
	return new Promise((resolve, reject) => {
		fs.readFile(url, 'utf-8', (err, data) => {
			if (err) {
				reject(err)
			}
			resolve(data)
		})
	})
}

// 文件上传工具
router.get('/files', async ctx => {
	ctx.body = await readFile(path.join(__dirname, '../../views/files.html'))
})
router.post('/files', koaBody({ multipart: true }), async ctx => {
	if (ctx.request.body.password !== '123456') {
		return ctx.body = { success: false, message: '密码错误' }
	}
	if (!ctx.request.files.file || typeof(ctx.request.files.file.path) !== 'string') {
		return ctx.body = { success: false, message: '文件未缓存' }
	}
	// 上传到服务器的文件会缓存到 用户目录/AppData/Local/Temp 目录
	const filePath = ctx.request.files.file.path
	const fileName = ctx.request.files.file.name
	try {
		const ans = await moveFile(filePath, path.join(__dirname, '../../files') + "/" + fileName);
		ctx.body = { success: true, code: '0000', message: ans }
	}catch (err) {
		console.error('/api/operator/files', err.message)
		ctx.body = { success: false, code:'9999', message: err.message }
	}
	
})

module.exports = router.routes();