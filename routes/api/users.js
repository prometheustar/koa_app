const Router = require('koa-router');
const router = new Router();
const bcrypt = require('bcryptjs');  // bcrypt 加密
const jwt = require('jsonwebtoken');
const md5 = require('md5');
const koaBody = require('koa-body')
const sharp = require('sharp')
const path = require('path')
const url = require('url')

const tools = require('../../config/tools.js');
const keys = require('../../config/keys.js');
const db = require('../../config/mysqldb.js');

const validator = require('../../validation/validator');
const registerValidator = require('../../validation/register');
const loginValidator = require('../../validation/loginValidator');
const tokenValidator = require('../../validation/tokenValidator')
const smsCodeValidator = require('../../validation/smsCodeValidator')


/**
 * @route GET api/users/current
 * @desc 验证客户端 token，有效重新返回登录信息
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
	try {
		const response = {
			success: true,
			message: 'OK',
			payload: {
				user: payload,
				token: jwt.sign(payload, keys.tokenKey, {expiresIn: 60*20})  // 重新签发 token
			}
		}
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
	let user = ctx.request.body
	console.log(user)
	// 验证注册信息格式
	const valid = await registerValidator(user)
	// 判断是否验证通过
	if (!valid.isvalid) {
		return ctx.body = {success: false, code: '1004', message: valid.message};
	}
	try{
		// 判断账户是否以存在
		const historyUser = await db.executeReader(`select phone from tb_member where nickname='${tools.transKeyword(user.nickname)}' or phone='${user.phone}' limit 1;`);
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
		const ans = await db.executeNoQuery(`insert into tb_member(nickname, password, phone) values('${tools.transKeyword(user.nickname)}', '${user.password}', '${user.phone}');`)
		if (ans !== 1) {
			return ctx.body = {success: false, code: '9999', message: 'server error!'};
		}
		ctx.body = {
			success: true,
			code: '0000',
			message: 'OK',
			payload: {
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
	let query = `select _id,nickname,password,phone,email,avatar,lastLogin,isBusiness from tb_member where ${validation.way}='${user.account}' limit 1;`;
	try {
		const result = await db.executeReader(query)
		if (result.length < 1) {
			// 没有该用户
			return ctx.body = {success: false, code: '0001', message: '用户不存在'}
		}
		const dbuser = result[0];
		// bcrypt 同步验证密码
		if (!bcrypt.compareSync(user.password, dbuser.password)) {
			// 验证失败
			return ctx.body = {success: false, code: '0001', message: '密码错误'}
		}
		// 查收货地址和店铺信息
		// const queryUserInfo = {
		// 	address: `select _id,mid,receiveName,address,phone,postcode,isDefault from tb_address where mid=${dbuser._id};`
		// }
		// // 该用户是店家
		// if (dbuser.isBusiness === 1) {

		// 	queryUserInfo.store = `select _id,storeName,click,storeStatus,isAudit from tb_store where mid=${dbuser._id};`
		// }
		// const userInfo = await db.executeReaderMany(queryUserInfo)
		// // 转换地址中的 buffer
		// for (let len = userInfo.address.length -1; len >= 0; len--) {
		// 	userInfo.address[len].isDefault = userInfo.address[len].isDefault.readInt8(0)
		// }

		// 查询成功返回 token
		const payload = {
			userId: dbuser._id,
			nickname: dbuser.nickname,
			phone: tools.transPhone(dbuser.phone),
			email: tools.transEmail(dbuser.email),
			avatar: dbuser.avatar,
			isSeller: dbuser.isBusiness.readInt8(0)
		}
		const response = {
			success: true,
			code: '0000',
			message: 'OK',
			payload: {  //token: 'Bearer '+ token
				user: payload,
				// address: userInfo.address,
				token: jwt.sign(payload, keys.tokenKey, {expiresIn: 60*20})
			}
		}
		ctx.body = response
		// 该用户是店家
		// if (Array.isArray(userInfo.store) && userInfo.store.length > 0) {
		// 	payload.storeId = userInfo.store[0]._id
		// 	userInfo.store[0].storeStatus = userInfo.store[0].storeStatus.readInt8(0)
		// 	response.payload.store = userInfo.store[0]
		// }
		// 签发 token
		// response.payload.token = jwt.sign(payload, keys.tokenKey, {expiresIn: 60*20});
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
		return ctx.body = {success: false, code: '1004', message: '手机号或验证码格式有误'}
	}
	// const query = {
	// 	dbuser: `select _id,nickname,password,phone,gender,avatar,lastLogin,isBusiness from tb_member where phone='${user.phone}';`,
	// 	dbsms: `select smsCode from member_sms where phone='${user.phone}' and date_add(now(),interval -5 minute) < creaTime and creaTime=(select max(creaTime) from member_sms where phone='${user.phone}' order by creaTime desc);`,
	// }
	try {
		const smsValid = await smsCodeValidator(user.sms_code, user.phone)
		if (!smsValid.isvalid) {
			return ctx.body = {success: false, code: '1004', message: smsValid.message}
		}
		// 手机号读取用户和验证码
		let dbuser = await db.executeReader(`select _id,nickname,password,phone,email,avatar,lastLogin,isBusiness from tb_member where phone='${user.phone}' limit 1;`)
		if (dbuser.length === 0) {
			return ctx.body = {success: false, code: '0001', message: '手机号无记录'};
		}
		dbuser = dbuser[0]
		// if (dbsms.length === 0) {
		// 	return ctx.body = {success: false, code: '0001', message: '验证码过期'};
		// }
		// const md5sms = md5(md5(user.sms_code + keys.secretOrKey) + user.phone);
		// if (md5sms !== dbsms[0].smsCode) {
		// 	return ctx.body = {success: false, code: '0001', message: '验证码错误'};
		// }
		// 查收货地址和店铺信息
		// const queryUserInfo = {
		// 	// address: `select _id,mid,receiveName,address,phone,postcode,isDefault from tb_address where mid=${dbuser._id};`
		// }
		// // 该用户是店家
		// if (dbuser.isBusiness === 1) {
		// 	queryUserInfo.store = `select _id,storeName,click,storeStatus,isAudit from tb_store where mid=${dbuser._id};`
		// }
		// const userInfo = await db.executeReaderMany(queryUserInfo)
		// // 转换地址中的 buffer
		// for (let len = userInfo.address.length -1; len >= 0; len--) {
		// 	userInfo.address[len].isDefault = userInfo.address[len].isDefault.readInt8(0)
		// }
		// 查询成功返回 token
		const payload = {
			userId: dbuser._id,
			nickname: dbuser.nickname,
			phone: tools.transPhone(dbuser.phone),
			email: tools.transEmail(dbuser.email),
			avatar: dbuser.avatar,
			isSeller: dbuser.isBusiness.readInt8(0)
		}
		const response = {
			success: true,
			code: '0000',
			message: 'OK',
			payload: {  //token: 'Bearer '+ token
				user: payload,
				token: jwt.sign(payload, keys.tokenKey, {expiresIn: 60*20})
			}
		}
		ctx.body = response
		// 该用户是店家
		// if (Array.isArray(userInfo.store) && userInfo.store.length > 0) {
		// 	payload.storeId = userInfo.store[0]._id
		// 	userInfo.store[0].storeStatus = userInfo.store[0].storeStatus.readInt8(0)
		// 	response.payload.store = userInfo.store[0]
		// }
		// // 签发 token
		// response.payload.token = jwt.sign(payload, keys.tokenKey, {expiresIn: 60*20});
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
 * @route GET /api/users/get_property
 * @desc 查询账户余额
 * @access 携带 token 访问
 */
router.get('/get_property', async ctx => {
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		 return ctx.body = {success: false, message: '请登录后操作', code: '1002'}
	}
	try {
		const property = await db.executeReader(`select property from tb_member where _id=${token.payload.userId}`)
		if (property.length < 1) {
			return ctx.body = {success: false, code: '0000', message: '数据异常'}
		}
		ctx.body = {success: true, code: '0000', message: 'OK', payload: property[0].property}
	}catch(err) {
		console.error('/api/users/address', err.message)
		ctx.body = {success: false, code: '9999', message: 'server busy'}
	}
})

/**
 * @route GET /api/users/user_address
 * @desc 查询收货地址
 * @access 携带 token 访问
 */
router.get('/user_address', async ctx => {
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		 return ctx.body = {success: false, message: '请登录后操作', code: '1002'}
	}
	try {
		const address = await db.executeReader(`select _id,mid,receiveName,address,phone,postcode,isDefault from tb_address where mid=${token.payload.userId} and isDrop=0;`)
		for (let i = 0, len = address.length; i < len; i++) {
			address[i].isDefault = address[i].isDefault.readInt8(0)
		}
		ctx.body = {success: true, code: '0000', message: 'OK', payload: address}
	}catch(err) {
		console.error('/api/users/user_address', err.message)
		ctx.body = {success: false, code: '9999', message: 'server busy'}
	}
})

/**
 * @route GET /api/users/get_property
 * @desc 保存聊天图片，保存头像(type : avatar)
 * @access 携带 token 访问
 */
router.post('/save_chat_image', koaBody({ multipart: true }), async ctx => {
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, message: '请登录后操作', code: '1002'}
	}
	if (!ctx.request.files.picture || !/^image\/(jpeg|png|gif|x-icon)$/.test(ctx.request.files.picture.type)) {
		return ctx.body = {success: false, message: '格式无效', code: '1002'}
	}
	try {
		let imgName = tools.randomStr()(ctx.request.files.picture.name)
		if (ctx.request.body.type === 'avatar') {
			let filepath = await tools.moveFile(ctx.request.files.picture.path, path.join(__dirname, '../../views/image/member/avatar/' + imgName + '_origin.jpg'))
			const avatar = await sharp(filepath).resize({ width: 100, height: 100, fit:'inside' }).toFile(path.join(__dirname, `../../views/image/member/avatar/${imgName}`))
		}else {
			let filepath = await tools.moveFile(ctx.request.files.picture.path, path.join(__dirname, '../../views/image/member/chat/' + imgName))
			const info = await sharp(filepath).resize({ width: 80, fit:'inside' }).toFile(path.join(__dirname, `../../views/image/member/chat/${imgName}_w80.jpg`))
		}
		ctx.body = {
			success: true,
			payload: imgName
		}
	}catch(err) {
		console.error('/api/users/save_chat_image', err.message)
		ctx.body = {success: false, code: '9999', message: 'server busy'}
	}
})

/**
 * @route GET /api/users/search_contacts
 * @desc 搜索好友
 * @access 携带 token 访问
 */
router.get('/search_contacts', async ctx => {
	const info = url.parse(ctx.request.url, true).query;
	if (info.keyword === '' || info.keyword === undefined) {
		return ctx.body = {success: false, code: '1004', message: 'empty keyword'}
	}
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, code: '1004', message: '请登录后操作'}
	}
	try {
		const keyword = tools.transKeyword(info.keyword)
		const contacts = await db.executeReader(`select m._id as userId,m.nickname,m.avatar from tb_member as m left join (select contacts from tb_contacts where userId=${token.payload.userId}) as c on m._id=c.contacts where m.nickname like '%${keyword}%' and m._id<>${token.payload.userId} and c.contacts is null;`)
		ctx.body = {success: true, payload: contacts}
	}catch(err) {
		console.error('/api/users/search_contacts', err.message)
		ctx.body = {success: false, code: '9999', message: 'server busy'}
	}
})

/**
 * @route /api/users/modify_safety
 * @desc 修改邮箱 {newEmail,smsCode} 或 手机号码{newPhone,smsCode}
 * @access 携带 token 访问
 */

router.post('/modify_safety', async ctx => {
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, code: '1004', message: '请登录后操作'}
	}
	const body = ctx.request.body
	try {
		// 验证短信验证码
		if (body.smsCode && /^\d{5,6}$/.test(body.smsCode)) {
			const smsValid = await smsCodeValidator(body.smsCode, false, token.payload.userId)
			if (!smsValid.isvalid) {
				return ctx.body = { success: false, message: smsValid.message }
			}
		}else {
			return ctx.body = { success: false, message: '验证码为空' }
		}
		// 修改邮箱
		if (validator.isEmail(body.newEmail)) {
			// 修改邮箱
			let emailResult = await db.executeNoQuery(`update tb_member set email='${body.newEmail}' where _id=${token.payload.userId};`)
			if (emailResult === 0) {
				return ctx.body = {success: false, code: '9999', message: '未知错误'}
			}
			ctx.body = {success: true, message: 'OK', code: '0000'}

		}else if (validator.isPhone(body.newPhone)) {
		// 修改手机号码
			let phoneResult = await db.executeNoQuery(`update tb_member set phone='${body.newPhone}' where _id=${token.payload.userId};`)
			if (phoneResult === 0) {
				return ctx.body = {success: false, code: '9999', message: '未知错误'}
			}
			ctx.body = {success: true, message: 'OK', code: '0000'}

		}else if(validator.isPassword(body.password) && validator.isPassword(body.newPassword)) {
		// 修改密码
			let dbuser = await db.executeReader(`select password from tb_member where _id=${token.payload.userId} limit 1;`)
			if (dbuser.length < 1) {
				return ctx.body = {success: false, code: '9999', message: '未知错误'}
			}
			dbuser = dbuser[0]
			if (!bcrypt.compareSync(body.password, dbuser.password)) {
				// 密码对比失败
				return ctx.body = {success: false, code: '0001', message: '密码有误'}
			}
			// 验证成功修改密码
			// bcrypt 同步加密密码
			const newPassword = bcrypt.hashSync(body.newPassword, bcrypt.genSaltSync(10))
			const psdResult = await db.executeNoQuery(`update tb_member set password='${newPassword}' where _id=${token.payload.userId};`)
			if (psdResult < 1) {
				return ctx.body = {success: false, code: '9999', message: '未知错误'}		
			}
			ctx.body = {success: true, message: 'OK', code: '0000'}
		}else {
			ctx.body = {success: false, code: '1004', message: '请求参数有误'}
		}
	}catch(err) {
		console.error('/api/users/modify_safety', err.message)
		ctx.body = {success: false, code: '9999', message: 'server busy'}
	}
})


/**
 * @route /api/users/user_info
 * @desc 修改邮箱 {newEmail,smsCode} 或 手机号码{newPhone,smsCode}
 * @access 携带 token 访问
 */
const getUserInfo = async ctx => {
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, code: '1004', message: '请登录后操作'}
	}
	try {
		const userInfo = await db.executeReader(`select _id as userId,nickname,phone,reallyName,idCard,gender,email,avatar,birth,entryDate,lastLogin from tb_member where _id=${token.payload.userId} limit 1;`)
		if (userInfo.length > 1) {
			return ctx.body = {success: false, code: '1004', message: 'unknow error'}
		}
		ctx.body = {success: true, message: 'OK', code: '0000', payload: {userInfo: {
			...userInfo[0], 
			phone: tools.transPhone(userInfo[0].phone),
			email: tools.transEmail(userInfo[0].email),
			idCard: tools.transIDCard(userInfo[0].idCard),
			reallyName: typeof(userInfo[0].reallyName) === 'string' ? '**' + userInfo[0].reallyName[userInfo[0].reallyName.length-1] : userInfo[0].reallyName
		}}}
	}catch(err) {
		console.error('/api/users/user_info', err.message)
		ctx.body = {success: false, code: '9999', message: 'server busy'}
	}
}
router.get('/user_info', getUserInfo)
/**
 * @route /api/users/user_info
 * @desc 修改邮箱 {newEmail,smsCode} 或 手机号码{newPhone,smsCode}
 * @access 携带 token 访问
 */
router.post('/modify_userinfo', async ctx => {
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, code: '1004', message: '请登录后操作'}
	}
	const modify = ctx.request.body
	if (Object.keys(modify).length === 0) {
		return ctx.body = {success: false, code: '1002', message: '要修改的信息为空'}
	}
	let change = {}
    if (modify.reallyName && /^[\u4e00-\u9fa5]{2,5}$/.test(modify.reallyName)) {
      change.reallyName = `'${tools.transKeyword(modify.reallyName)}'`
    }
    if (modify.idCard && /^\d{18}$/.test(modify.idCard)) {
      change.idCard = `'${modify.idCard}'`
    }
    if (modify.avatar && modify.avatar !== "default.jpg" && /^\w{10}_\d{8}\.(jpg|jpeg|png|icon|gif)$/.test(modify.avatar)) {
      change.avatar = `'${modify.avatar}'`
    }
    if (modify.gender && /^[012]$/.test(modify.gender)) {
      change.gender = modify.gender
    }
    if (modify.birth && /^(19|20)\d{2}-([1-9]|1[012])-([1-9]|[1-2][0-9]|3[01])$/.test(modify.birth)) {
      change.birth = `'${modify.birth}'`
    }
    let changeKeys = Object.keys(change)
    if (changeKeys.length === 0) {
		return ctx.body = {success: false, code: '1002', message: '修改的信息有误'}
	}
	let sql = 'update tb_member set '
	for (let i = 0; i < changeKeys.length; i++) {
		sql += `${changeKeys[i]}=${change[changeKeys[i]]},`
	}
	sql = sql.replace(/,$/, ` where _id=${token.payload.userId};`)
	try {
		const rows = await db.executeNoQuery(sql)
		if (rows === 0) {
			return ctx.body = {success: false, code: '1002', message: '意外的错误'}
		}
		await getUserInfo(ctx)
	}catch(err) {
		console.error('/api/users/modify_userinfo', err.message)
		ctx.body = {success: false, code: '9999', message: 'server busy'}
	}
})

router.get('/chat_window', async ctx => {
	const tokenValid = tokenValidator(ctx.request.url)
	if (!tokenValid.isvalid) {
		ctx.status = 401
		return ctx.body = tokenValid.message
	}
	try {
		const chat = (await tools.readFile(path.join(__dirname, '../../views/chat/index.html'))).toString()
		ctx.type = "text/html;charset=utf-8"
		ctx.body = chat.replace('__INITIAL_TOKEN_STR__', url.parse(ctx.request.url, true).query.token)
	}catch(err) {
		console.error('/api/users/chat_window', err.message)
		ctx.status = 500
		ctx.body = {success: false, code: '9999', message: 'server busy'}
	}
})

module.exports = router.routes()