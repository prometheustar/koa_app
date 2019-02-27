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
const loginValidator = require('../../validation/loginValidator');
const tokenValidator = require('../../validation/tokenValidator')
/**
 * @route GET api/users/current
 * @desc 验证 token，有效重新返回登录信息
 * @access 接口是公开的
 */
router.get('/current', async ctx => {
	const token = tokenValidator(ctx)
	// token 不合法
	if (!token.isvalid) {
		return ctx.body = { success: false, message: token.message }
	}
	const payload = token.payload
	delete payload.iat
	delete payload.exp
	// 查 address, sotreInfo
	const queryUserInfo = {
		address: `select _id,mid,receiveName,address,phone,postcode,isDefault from tb_address where mid=${payload.userId};`
	}
	if (payload.storeId !== undefined) {
		queryUserInfo.store = `select _id,storeName,mid,nickname,click,logo from tb_store where _id=${payload.storeId} and mid=${payload.userId} and storeStatus=0 and isAudit=1;`
	}
	try {
		const queryInfo = await db.executeReaderMany(queryUserInfo)
		for (let len = queryInfo.address.length -1; len >= 0; len--) {
			queryInfo.address[len].isDefault = queryInfo.address[len].isDefault.readInt8(0)
		}
		const response = {
			success: true,
			message: 'OK',
			payload: {
				user: { ...payload },
				address: queryInfo.address
			}
		}
		if (!Array.isArray(queryInfo.store) || queryInfo.store.length < 1) {
			delete payload.storeId
		}else {
			payload.storeId = queryInfo.store[0]._id
			response.payload.store = queryInfo.store[0]
		}
		response.payload.token = jwt.sign(payload, keys.tokenKey, {expiresIn: 60*20})  // 重新签发 token
		ctx.body = response
	}catch(err) {
		console.error('/api/users/current', err.message)
		ctx.status = 400;
		ctx.body = {success: false, code: '9999', message: err.message};
	}
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
		console.error('/api/users/register', err.message);
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
	const user = ctx.request.body
	const validation = loginValidator(user)
	if (!validation.isvalid) {
		// 参数错误
		return ctx.body = {success: false, message: validation.message, code: '1004'}
	}
	// 查询数据库，账号是否存在
	let query = `select _id,nickname,password,phone,gender,avatar,lastLogin,isBusiness from tb_member where ${validation.way}='${user.account}';`;
	try {
		const result = await db.executeReader(query)
		if (result.length < 1) {
			// 没有该用户
			return ctx.body = {success: false, code: '0001', message: '用户不存在'}
		}
		const dbuser = result[0];
		dbuser.isBusiness = dbuser.isBusiness.readInt8(0)
		// bcrypt 同步验证密码
		if (!bcrypt.compareSync(user.password, dbuser.password)) {
			// 验证失败
			return ctx.body = {success: false, code: '0001', message: '密码错误'}
		}
		// 查收货地址和店铺信息
		const queryUserInfo = {
			address: `select _id,mid,receiveName,address,phone,postcode,isDefault from tb_address where mid=${dbuser._id};`
		}
		// 该用户是店家
		if (dbuser.isBusiness === 1) {
			queryUserInfo.store = `select _id,storeName,click,storeStatus,isAudit from tb_store where mid=${dbuser._id};`
		}
		const userInfo = await db.executeReaderMany(queryUserInfo)
		// 转换地址中的 buffer
		for (let len = userInfo.address.length -1; len >= 0; len--) {
			userInfo.address[len].isDefault = userInfo.address[len].isDefault.readInt8(0)
		}
		// 查询成功返回 token
		const payload = {
			userId: dbuser._id,
			nickname: dbuser.nickname,
			phone: tools.transPhone(dbuser.phone),
			gender: dbuser.gender,
			avatar: dbuser.avatar
			// storeId
		}
		const response = {
			success: true,
			code: '0000',
			message: 'OK',
			payload: {  //token: 'Bearer '+ token
				user: payload,
				address: userInfo.address
				// token, store
			}
		}
		// 该用户是店家
		if (Array.isArray(userInfo.store) && userInfo.store.length > 0) {
			payload.storeId = userInfo.store[0]._id
			userInfo.store[0].storeStatus = userInfo.store[0].storeStatus.readInt8(0)
			response.payload.store = userInfo.store[0]
		}
		// 签发 token
		response.payload.token = jwt.sign(payload, keys.tokenKey, {expiresIn: 60*20});
		ctx.body = response
	}catch(err) {
		console.error('/api/users/login', err.message)
		ctx.status = 400;
		ctx.body = {success: false, code: '9999', message: err.message};
	}
})

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
	const query = {
		dbuser: `select _id,nickname,password,phone,gender,avatar,lastLogin,isBusiness from tb_member where phone='${user.phone}';`,
		dbsms: `select smsCode from member_sms where phone='${user.phone}' and date_add(now(),interval -5 minute) < creaTime and creaTime=(select max(creaTime) from member_sms where phone='${user.phone}' order by creaTime desc);`,
	}
	try {
		// 手机号读取用户和验证码
		let {dbuser, dbsms} = await db.executeReaderMany(query)
		if (dbuser.length === 0) {
			return ctx.body = {success: false, code: '0001', message: '手机号无记录'};
		}
		if (dbsms.length === 0) {
			return ctx.body = {success: false, code: '0001', message: '验证码过期'};
		}
		const md5sms = md5(md5(user.sms_code + keys.secretOrKey) + user.phone);
		if (md5sms !== dbsms[0].smsCode) {
			return ctx.body = {success: false, code: '0001', message: '验证码错误'};
		}
		dbuser = dbuser[0]
		// 查收货地址和店铺信息
		const queryUserInfo = {
			address: `select _id,mid,receiveName,address,phone,postcode,isDefault from tb_address where mid=${dbuser._id};`
		}
		// 该用户是店家
		if (dbuser.isBusiness === 1) {
			queryUserInfo.store = `select _id,storeName,click,storeStatus,isAudit from tb_store where mid=${dbuser._id};`
		}
		const userInfo = await db.executeReaderMany(queryUserInfo)
		// 转换地址中的 buffer
		for (let len = userInfo.address.length -1; len >= 0; len--) {
			userInfo.address[len].isDefault = userInfo.address[len].isDefault.readInt8(0)
		}
		// 查询成功返回 token
		const payload = {
			userId: dbuser._id,
			nickname: dbuser.nickname,
			phone: tools.transPhone(dbuser.phone),
			gender: dbuser.gender,
			avatar: dbuser.avatar
			// storeId
		}
		const response = {
			success: true,
			code: '0000',
			message: 'OK',
			payload: {  //token: 'Bearer '+ token
				user: payload,
				address: userInfo.address
				// token, store
			}
		}
		// 该用户是店家
		if (Array.isArray(userInfo.store) && userInfo.store.length > 0) {
			payload.storeId = userInfo.store[0]._id
			userInfo.store[0].storeStatus = userInfo.store[0].storeStatus.readInt8(0)
			response.payload.store = userInfo.store[0]
		}
		// 签发 token
		response.payload.token = jwt.sign(payload, keys.tokenKey, {expiresIn: 60*20});
		ctx.body = response
	}catch(err) {
		console.error('/api/users/phonelogin', err.message);
		ctx.status = 400;
		ctx.body = {success: false, code: '9999', message: 'server busy!'};
	}
})

/**
 * @route POST api/users/nickname
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
			console.error('/api/users/nickname', err.message)
			ctx.body = {success: false, code: '9999', message: err.message};
		});
});

/**
 * @route GET /api/users/nickname
 * @desc 传入 memberId ，查询收货地址
 * @access 携带 token 访问
 */
router.post('/address', async ctx => {
	const token = tokenValidator(ctx)
	if (!token.isvalid) return ctx.body = {success: false, message: '没有该接口的访问权限', code: '1002'}
	const memberId = token.payload.userId
	try {
		const address = await db.executeReader(`select mid, receiveName, address,phone,postcode from tb_address where mid=${memberId};`)
		ctx.body = {success: true, code: '0000', message: 'OK', payload: address}
	}catch(err) {
		console.error('/api/users/address', err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})

module.exports = router.routes()