const Router = require('koa-router');
const router = new Router();
const bcrypt = require('bcryptjs');  // bcrypt 加密
const jwt = require('jsonwebtoken');
const md5 = require('md5');

// 引入 tools
const tools = require('../../config/tools.js');
const keys = require('../../config/keys.js');
const db = require('../../config/mysqldb.js');

const validator = require('../../validation/validator');
const validateRegister = require('../../validation/register');
const validateLogin = require('../../validation/login');

/**
 * @route GET api/users/current
 * @desc 验证 token，返回token 中的信息
 * @access 接口是公开的
 */
router.get('/current', async ctx => {
	if (!ctx.jwt.passport) {
		return ctx.body = {
			success: false,
			message: ctx.jwt.message
		}
	}
	ctx.body = {
		success: true,
		payload: {
			user: ctx.jwt.user
		}
	};
})

/**
 * @route GET api/users/register
 * @desc 注册接口地址
 * @access 接口是公开的
 */
router.post('/register', async ctx => {
	let user = ctx.request.body;
	// 验证注册信息格式
	const valid = validateRegister(user);
	// 判断是否验证通过
	if (!valid.isvalid) {
		return ctx.body = {success: false, code: '1004', message: valid.message};
	}
	try{
		// 判断账户是否以存在
		const historyUser = await db.executeReader(`select phone from tb_member where nickname='${user.nickname}' or phone='${user.phone}';`);
		if (historyUser.length > 0) {
			// 账户已经存在
			if (historyUser[0].phone === user.phone)
				return ctx.body = {success: false, code: '0002', message: '手机号已存在'};
			return ctx.body = {success: false, code: '0002', message: '昵称已存在'};
		}
		// bcrypt 同步加密密码
		const salt = bcrypt.genSaltSync(10);
		user.password = bcrypt.hashSync(user.password, salt);
		// 通过，存入数据库
		const ans = await db.executeNoQuery(`insert into tb_member(nickname, password, phone) values('${user.nickname}', '${user.password}', '${user.phone}');`)
		if (ans !== 1) {
			return ctx.body = {success: false, code: '9999', message: 'server error!'};
		}
		ctx.body = {
			success: true,
			code: '0000',
			message: 'OK',
			payload: {
				rowsAffected: ans,
				nickname: user.nickname,
				phone: tools.transPhone(user.phone)
			}
		};
	}catch(err) {
		console.error('register', err.message);
		ctx.status = 400;
		ctx.body = {success: false, code: '9999', message: err.message};
	}
});

/**
 * @route GET api/users/login
 * @desc 登录接口地址 返回 token
 * @access 接口是公开的
 */
router.post('/login', async ctx => {
	const user = ctx.request.body;
	const valid = validateLogin(user);
	if (!valid.isvalid) {
		// 参数错误
		return ctx.body = {success: false, message: valid.message, code: '1004'}
	}
	// 查询数据库，账号是否存在
	let query = `select * from tb_member where ${user.way}='${user.account}';`;
	await db.executeReader(query)
		.then(async result => {
			if (result.length === 0) {
				// 没有该用户
				return ctx.body = {success: false, code: '0001', message: '用户不存在'}
			}
			const dbuser = result[0];
			// bcrypt 同步验证密码
			if (!bcrypt.compareSync(user.password, dbuser.password)) {
				// 验证失败
				return ctx.body = {success: false, code: '0001', message: '密码错误'}
			}
			let storeInfo = [];
			if (dbuser.isBusiness.readInt8(0) === 1) {
				storeInfo = await db.executeReader(`select _id as storeId,storeName,click,storeStatus,isAudit from tb_store where mid=${dbuser._id} and storeStatus=0;`)
			}
			// 查询成功返回 token
			const payload = {
				_id: dbuser._id, 
				nickname: dbuser.nickname,
				phone: tools.transPhone(dbuser.phone),
				gender: dbuser.gender,
				avatar: dbuser.avatar,
				storeId: 1
			}
			const token = jwt.sign(payload, keys.secretOrKey, {expiresIn: 3600});
			const response = {
				success: true,
				code: '0000',
				message: 'OK',
				payload: {
					token: token,  //'Bearer '+ token
					user: payload
				}
			}
			if (storeInfo.length > 0) {
				storeInfo[0].storeStatus = storeInfo[0].storeStatus.readInt8(0)
				response.payload.store = storeInfo[0]
			}
			ctx.body = response
		})
		.catch(err => {
			ctx.status = 400;
			ctx.body = {success: false, code: '9999', message: err.message};
		});
});
/**
 * @route GET api/users/phonelogin
 * @desc 短信登录接口地址 返回 token
 * @access 接口是公开的
 */
router.post('/phonelogin', async ctx => {
	const user = ctx.request.body;
	if (!validator.isPhone(user.phone) || validator.isEmpty(user.sms_code)) {
		return ctx.body = {success: false, code: '1004', message: '手机号或验证码格式有误'};
	}
	const queryuser = `select * from tb_member where phone='${user.phone}';`;
	const querysms = `select smsCode from member_sms where phone='${user.phone}' and date_add(now(),interval -5 minute) < creaTime and creaTime=(select max(creaTime) from member_sms where phone='${user.phone}')`;
	try {
		// 手机号读取用户
		const dbuser = await db.executeReader(queryuser);
		if (queryuser.length === 0) {
			return ctx.body = {success: false, code: '0001', message: '手机号无记录'};
		}
		// 读取验证码记录
		const dbsms = await db.executeReader(querysms)
		if (dbsms.length === 0) {
			return ctx.body = {success: false, code: '0001', message: '手机号无记录'};
		}
		const md5sms = md5(md5(user.sms_code + keys.secretOrKey) + user.phone);
		if (md5sms !== dbsms[0].smsCode) {
			return ctx.body = {success: false, code: '0001', message: '验证码错误'};
		}
		// 查询成功返回 token
		const payload = {
			_id: dbuser[0]._id, 
			nickname: dbuser[0].nickname,
			phone: tools.transPhone(dbuser[0].phone),
			gender: dbuser[0].gender,
			avatar: dbuser[0].avatar
		}
		const token = jwt.sign(payload, keys.secretOrKey, {expiresIn: 3600});
		ctx.body = {
			success: true,
			code: '0000',
			message: 'OK',
			payload: {
				token: token,  //'Bearer '+ token
				user: payload
			}
		}

	}catch(err) {
		console.error(err.message);
		ctx.status = 400;
		ctx.body = {success: false, code: '9999', message: 'server busy!'};
	}
})

/**
 * @route GET api/users/nickname
 * @desc 传入名字 nickname, 查询数据库中是否重复
 * @access 接口是公开的
 */
router.post('/nickname', async ctx => {
	const nickname = ctx.request.body.nickname;
	// 名字是否存在
	await db.executeReader(`select count(1) as 'num' from tb_member where nickname='${nickname}';`)
		.then(result => {
			if (result[0]["num"] !== 0) {
				return ctx.body = {
					success: false,
					code: '0000',
					message: '名称已存在'
				};
			}
			ctx.body = {
				success: true,
				code: '0000',
				message: 'OK',
				payload: {
					nickname
				}
			};
		})
		.catch(err => {
			ctx.body = {success: false, code: '9999', message: err.message};
		});
});


module.exports = router.routes()