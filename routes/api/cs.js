const KoaRouter = require('koa-router');
const router = new KoaRouter();
const url = require('url');
const bcrypt = require('bcryptjs');  // bcrypt 加密

const db = require('../../config/mysqldb');
const registerValidator = require('../../validation/csregister');
const loginValidator = require('../../validation/cslogin');

/**
 * @route POST /api/cs/register
 * @desc 管理员账号创建
 * @access 接口是公开的
 */
router.post('/register', async ctx => {
	let info = ctx.request.body;
	// 格式验证
	const ans = registerValidator(info);
	if (!ans.isvalid) {
		return ctx.body = {
			success: false,
			code: '1004',
			message: ans.message
		}
	}
	try{
		// 格式验证成功，验证总管理员账户密码
		const manager = await db.executeReader(`select password from tb_manager where account='${info.crea_account}' and overman=1;`);
		if (manager.length !== 1) {
			return ctx.body = {
				success: false,
				code: '0001',
				message: '总管理员不存在或没有创建账户的权限'
			}
		}
		// 验证总管理员密码
		if (!bcrypt.compareSync(info.crea_password, manager[0].password)) {
			// 验证失败
			return ctx.body = {success: false, code: '0001', errors: {password: '总管理员密码错误'}}
		}
		// 验证账户是否存在
		const repeat = await db.executeReader(`select account from tb_manager where account='${info.account}';`);
		if (repeat.length > 0) {
			return ctx.body = {success: false, code: '0001', messsage: '账户名已存在'}
		}
		// 验证成功，创建管理员账号
		// bcrypt 同步加密密码
		const salt = bcrypt.genSaltSync(10);
		info.password = bcrypt.hashSync(info.password, salt);
		// 存入数据库
		const insert = `insert into tb_manager(account,password,name,overman,creaAccount) values('${info.account}','${info.password}','${info.name}',${info.overman},'${info.crea_account}');`;
		const addManager = await db.executeNoQuery(insert);
		if (addManager === 1) {
			//创建成功
			ctx.body = {success: true, code: '0000', message: 'OK'}
		}else {
			ctx.bdoy = {success: false, code: '9999', message: '数据库插入错误'}
		}
	}catch(err){
		console.error('/api/cs/register', err.message)
		ctx.body = {
			success: false,
			code: '9999',
			message: err.message
		}
	}
});

/**
 * @route POST /api/cs/login
 * @desc 管理员账号登录
 * @access 接口是公开的
 */
router.post('/login', async ctx => {
	const info = ctx.request.body;
	const ans = loginValidator(info);
	if (!ans.isvalid) {
		return ctx.body = {
			success: false,
			message: ans.message,
			code: '1004'
		}
	}
	// 格式验证成功
	try{
		// 验证账号
		const manager = await db.executeReader(`select * from tb_manager where account='${info.account}';`);
		if (manager.length !== 1) {
			return ctx.body = {success: false, message: '账户不存在', code: '0001'}
		}
		// 验证账号密码
		if (!bcrypt.compareSync(info.password, manager[0].password)) {
			return ctx.body = {success: false, message: '密码错误', code: '0001'}
		}
		// 账号密码验证成功
		delete manager[0].password;
		ctx.body = {
			success: true,
			code: '0000',
			message: 'OK',
			payload: {
				...manager[0],
				overman: manager[0].overman.readUInt8(0, true) // 将 bit Buffer 类型数据转换成 number
			}
		}
	}catch(err) {
		console.error('/api/cs/login', err.message);
		ctx.body = {success: false, message: err.message, code: '9999'}
	}
});
module.exports = router.routes();