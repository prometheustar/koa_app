const KoaRouter = require('koa-router');
const router = new KoaRouter();
const Decimal = require('decimal.js-light')
const md5 = require('md5')
const koaBody = require('koa-body')
const path = require('path')
const sharp = require('sharp')

const db = require('../../config/mysqldb.js')
const tools = require('../../config/tools')
const keys = require('../../config/keys')
const alipay = require('../../config/alipay')
const tokenValidator = require('../../validation/tokenValidator')
const smsCodeValidator = require('../../validation/smsCodeValidator')
const validator = require('../../validation/validator')
const socket = require('../ws/wsserver')
// const { addCloseOrder } = require('../../config/closeOrderQueue')
// 设置 Decimal 计算精度
Decimal.set({
  precision: 10,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21
});

/**
 * 商品按不同店铺分成多个订单，if 购物车 => 已购买，
 * @route GET /api/order/submit_order
 * params  goodDetailId [1,2,...] , numbers[1,2,...] , addressId(int) , shopCatIds(arr)yes or no
 * @access 携带 token 访问
 */
router.post('/submit_order', async ctx => {
	// token 验证
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, message: '没有访问权限', code: '1002'}
	}
	// 接口参数验证
	const param = ctx.request.body
	const orderValid = validator.submitOrderValidator(param)
	if (!orderValid.isvalid) {
		return ctx.body = {success: false, message: orderValid.message, code: '1002'}
	}
	// 验证通过，插入数据库
	// 进行地址验证和商品查询，必须是登录用户自己的收货地址
	let goodDetailSQL = {
		// 查询商品详情
		products: `select gd._id as gdId,gd.amount,gd.price,g.storeId from tb_goodDetail gd join tb_goods g on gd.goodId=g._id where gd.state=0 and gd.amount>0 and g.checkstate=1 and g.state=0 and gd._id in (`,
		address: `select _id from tb_address where _id=${param.addressId} and mid=${token.payload.userId} limit 1;`, // 查询地址是否正确
	}
	for (let i = 0, len = param.goodDetailIds.length, temp; i < len; i++) {
		// 对 defailId 进行降序排序
		for (let j = i+1; j < len; j++) {
			if (param.goodDetailIds[i] < param.goodDetailIds[j]) {
				temp = param.goodDetailIds[i]; param.goodDetailIds[i] = param.goodDetailIds[j]; param.goodDetailIds[j] = temp;  // goodDetialId交换值
				temp = param.numbers[i]; param.numbers[i] = param.numbers[j]; param.numbers[j] = temp;  // 数量交换值
				temp = param.messages[i]; param.messages[i] = param.messages[j]; param.messages[j] = temp;  // 备注交换值
			}
		}
		if (i===len-1) { goodDetailSQL.products += `${param.goodDetailIds[i]}) order by gd._id desc limit ${len};`; break }
		goodDetailSQL.products += `${param.goodDetailIds[i]},`
	}
	try {
		const goodDetailAns = await db.executeReaderMany(goodDetailSQL)
		if (goodDetailAns.products.length !== param.goodDetailIds.length || goodDetailAns.address.length < 1) {
			return ctx.body = {success: false, message: '订单数据异常', code: '1011'}
		}
		// 根据商品的不同店铺生成多条订单，插入 tb_order 和 tb_orderDetail 数据
		let orderSQL = {
			order: 'insert into tb_order(orderno,mid,sumPrice,addressId,storeId) values',
			orderDetail: 'insert into tb_orderDetail(orderno,goodDetailId,price,number,message) values',
			// shopCar
		}
		if (orderValid.updateShopCarSQL) {
			orderSQL.shopCar = orderValid.updateShopCarSQL
		}
		let stores = [] // 临时储存店铺 ID
		let ordernos = [] // 临时储存每个店铺的 orderno
		let sumPrice = [] // 临时存储价格小计和
		for (let i = 0, len = goodDetailAns.products.length, index, storeId, orderno, subtotal; i < len; i++) {
			if (goodDetailAns.products[i].amount < param.numbers[i]) {
				return ctx.body = {success: false, message: '所选商品数量超过库存量', code: '1011'}
			}
			orderSQL[i] = `update tb_goodDetail set amount=amount-${param.numbers[i]} where _id=${goodDetailAns.products[i].gdId};` // 更新库存
			index = stores.indexOf(goodDetailAns.products[i].storeId)
			subtotal = new Decimal(goodDetailAns.products[i].price).times(param.numbers[i]) // 小计
			if (index !== -1) {  // 店铺的订单已添加到 orderSQL
				sumPrice[index] = subtotal.plus(sumPrice[index])
				orderSQL.orderDetail += `('${ordernos[index]}',${goodDetailAns.products[i].gdId},${subtotal.toNumber()},${param.numbers[i]},'${param.messages[i]}'),`
			}else {
				storeId = goodDetailAns.products[i].storeId
				orderno = tools.getOrderno()
				stores.push(storeId); ordernos.push(orderno); sumPrice.push(subtotal)
				orderSQL.order += `('${orderno}',${token.payload.userId},{{sumPrice${storeId}}},${param.addressId},${storeId}),`
				orderSQL.orderDetail += `('${orderno}',${goodDetailAns.products[i].gdId},${subtotal.toNumber()},${param.numbers[i]},'${param.messages[i]}'),`
			}
		}
		for (let i = 0, len = stores.length; i < len; i++) {
			orderSQL.order = orderSQL.order.replace(`{{sumPrice${stores[i]}}}`, sumPrice[i].toString())
		}
		orderSQL.order = orderSQL.order.replace(/,$/, ';')
		orderSQL.orderDetail = orderSQL.orderDetail.replace(/,$/, ';')
		const orderAns = await db.executeNoQueryMany(orderSQL)
		if (orderAns.order !== ordernos.length) {
			return ctx.body = {success: false, message: '未知错误', code: '1011'}
		}
		// 将订单添加到关闭队列中
		// ordernos.forEach(orderno => {
		// 	addCloseOrder(orderno)
		// })
		// 执行成功后返回付款二维码，金额
		const totalSumPrice = sumPrice.reduce((prev, now) => now.plus(prev), 0).toString()
		const alipayURL = await alipay(ordernos, totalSumPrice)
		ctx.body = {
			success: true,
			code: '0000',
			payload: {
				alipayURL,
				sumPrice: totalSumPrice,
				ordernos,
			}
		}
	}catch(err) {
		console.error('/api/users/submit_order', err)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})

/**
 * 余额付款前请求获得签名密匙 md5(keys.paySign + userId)
 * @route GET /api/order/get_pay_sign
 * @access 携带 token 访问
 */
router.get('/get_pay_sign', ctx => {
	// token 验证
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, message: '没有访问权限', code: '1002'}
	}
	ctx.body = {success: true, payload: { sign: md5(keys.paySign + token.payload.userId) }}
})

/**
 * 余额付款接口
 * @route GET /api/order/property_pay_order
 * params  ordernos，sign，smsCode
 * @access 携带 token 访问
 */
router.post('/property_pay_order', async ctx => {
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, message: '没有访问权限', code: '1002'}
	}
	const req = ctx.request.body
	if (!/\d{5,6}/.test(req.smsCode) || !Array.isArray(req.ordernos) || req.ordernos.length == 0 || typeof(req.sign) !== 'string' || req.sign.length !== 32) {
		return ctx.body = {success: false, message: '接口参数错误', code: '1002'}
	}
	try {
		/**
		 * 1. 验证 sign
		 * 2. 验证短信
		 */
		var validateSign = md5(req.ordernos.reduce((prev, now) => prev + now, '') + md5(keys.paySign + token.payload.userId))
		if (validateSign !== req.sign) {
			return ctx.body = {success: false, message: '接口参数签名有误', code: '1002'}
		}
		const smsValid = await smsCodeValidator(req.smsCode, null, token.payload.userId)
		if (!smsValid.isvalid) {
			return ctx.body = {success: false, message: '验证码有误', code: '1002'}
		}
		/**
		 * 查询余额，查询订单
		 */
		let query = {
			user: `select property from tb_member where _id=${token.payload.userId} limit 1;`,
			orders: 'select orderno,sumPrice from tb_order where '
		}
		// 这个 SQL 修改订单 isPay 状态
		let modifyOrderPayState = 'update tb_order set isPay=1,payway=2 where isPay=0 and ('

		for (let i = 0, len = req.ordernos.length, end = ' or ', end2 = ' or '; i < len; i++) {
			if (i === len-1) {
				end = ` limit ${len};`
				end2 = ');'
			}
			query.orders += `orderno='${req.ordernos[i]}'${end}`
			modifyOrderPayState += `orderno='${req.ordernos[i]}'${end2}`
		}
		query = await db.executeReaderMany(query)
		if (query.user.length === 0 || query.orders.length !== req.ordernos.length) {
			return ctx.body = {success: false, message: '未知错误', code: '1002'}
		}
		// 订单总额
		let total = new Decimal(query.orders[0].sumPrice)
		for (let i = 1, len = query.orders.length; i < len; i++) {
			total = total.plus(query.orders[i].sumPrice)
		}
		if (query.user[0].property < total.toNumber()) {
			return ctx.body = {success: false, message: '余额不足', code: '1002'}
		}

		/**
		 * 付款操作，修改订单状态，事务
		 */
		let executePay = {
			property: `update tb_member set property=property-${total.toString()} where _id=${token.payload.userId} and property>=${total.toString()};`,
			modifyOrderPayState: modifyOrderPayState
		}
		await db.executeReader('begin;')
		try {
			executePay = await db.executeNoQueryMany(executePay)
			if (executePay.property !== 1 || executePay.modifyOrderPayState !== req.ordernos.length) {
				// 回滚
				await db.executeReader('rollback;')
				return ctx.body = {success: false, message: '服务器忙，请稍后重试！', code: '1002'}
			}
			// 付款成功，提交修改
			await db.executeReader('commit;')
			ctx.body = {success: true, message: 'OK'}
		}catch(err) {
			await db.executeReader('rollback;')
			throw err
		}
	}catch(err) {
		console.error('/api/users/property_pay_order', err)
		ctx.body = {success: false, code: '9999', message: 'server busy'}
	}
})


/**
 * 支付宝支付成功回调接口
 * 验证 app_id, passback_params md5(ordernos + secret), trade_status: TRADE_SUCCESS
 * 验证通过，订单状态 => 已付款
 */
// https://docs.open.alipay.com/270/105902/
router.post('/alipay_notify', async ctx => {
	const result = ctx.request.body
	// 验证
	if (result.app_id !== keys.alipayAppId || result.trade_status !== 'TRADE_SUCCESS') { return }
	let orders;
	try {
		const valid = decodeURIComponent(result.passback_params).split('^oo^')
		if (md5(valid[0] + keys.alipaySecret) !== valid[1]) {
			return console.error('/alipay_notify', '支付宝回调接口出错！')
		}
		orders = JSON.parse(valid[0])
	}catch(err) {
		return console.error('/alipay_notify', '支付宝回调接口出错！')
	}
	// 支付成功，改订单表已付款，ws 通知网页，确认收货后；卖家账号余额+sum
	try {
		const paySQL = {
			update: 'update tb_order set isPay=1 where orderno in (',
			member: `select mid from tb_order where orderno='${result.out_trade_no}' limit 1;`
		}
		for (let i = 0, len = orders.length, end = ','; i < len; i++) {
			if (i === len-1) { end = ');' }
			paySQL.update += `${orders[i]}${end}`
		}
		const payAns = await db.executeReaderMany(paySQL)
		if (payAns.member.length < 1 || payAns.update.affectedRows < 1) {
			return console.error('/alipay_notify, database miss', payAns)
		}
		if (socket.wss !== null) {
			socket.wss.sendMsg({
				type: 'payOrderSuccess',
				origin: 'koa',
				target: payAns.member[0].mid,
				content: result.out_trade_no
			})
		}
		ctx.body = 'success' // 回复 alipay
	}catch(err) {
		console.error('/api/order/alipay_notify', err.message)
	}
})


/**
 * @route POST /api/order/putaway
 * @params  goodId(int), state(bit)
 * @desc 上架或下架商品
 * @access 携带 token 访问
 */
router.post('/putaway', async ctx => {
	const info = ctx.request.body
	let goodId = ''
	let response = {success: false, message: '接口参数错误', code: '1002'}
	if (/^[01]$/.test(info.state)) {
		if (!Array.isArray(info.goodIds)) {
			try {
				info.goodIds = JSON.parse(info.goodIds)
				if (!Array.isArray(info.goodIds)) {
					return ctx.body = response
				}
			}catch(err) {
				return ctx.body = response
			}
		}
	}else {
		return ctx.body = response
	}
	for (let i = 0, len = info.goodIds.length; i < len; i ++) {
		if (!/^[1-9]\d*$/.test(info.goodIds[i])) {
			return ctx.body = response
		}else {
			let end = i === len - 1 ? '' : ' or '
			goodId += `_id=${info.goodIds[i] + end}`
		}
	}
	try {
		const result = await db.executeNoQuery(`update tb_goods set state=${info.state} where state<>${info.state} and checkstate=1 and (${goodId});`)
		ctx.body = {success: true, code: '0000', message: 'OK', payload: result}
	}catch(err) {
		console.error('/api/order/putaway', err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})

/**
 * @route POST /api/order/send_product
 * @params  orderDetailId(int), postWay(string25)运送方式, expNumber(string(50))快递单号
 * @desc 根据 tb_orderDetail(_id) 发货
 * @access 携带 token 访问
 */
router.post('/send_product', async ctx => {
	const info = ctx.request.body
	if (!/^[1-9]\d*$/.test(info.orderDetailId) || typeof(info.postWay) !== 'string' || info.postWay === '' || !/^\w+$/.test(info.expNumber)) 
		return ctx.body = {success: false, message: '接口参数错误', code: '1002'}

	try {
		const result = await db.executeNoQuery(`update tb_orderDetail set isSend=1,postWay='${info.postWay}',expNumber='${info.expNumber}' where _id=${info.orderDetailId};`)
		if (result < 1) {
			return ctx.body = {success: false, message: '订单不存在', code: '1002'}
		}
		ctx.body = {success: true, code: '0000', message: 'OK'}
	}catch(err) {
		console.error('/api/order/send_product', err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})

/**
 * @route POST /api/order/pay_order
 * @params  orderno
 * @desc 订单付款
 * @access 携带 token 访问
 */
router.post('/pay_order', async ctx => {
	// token 验证
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, message: '没有访问权限', code: '1002'}
	}
	if (!/^\d{18}$/.test(ctx.request.body.orderno)) {
		return ctx.body = {success: false, message: '订单错误', code: '1002'}
	}
	try {
		const order = await db.executeReader(`select sumPrice from tb_order where mid=${token.payload.userId} and orderno='${ctx.request.body.orderno}' and isPay=0 limit 1;`)
		if (order.length === 0) {
			return ctx.body = {success: false, message: '订单不存在', code: '1002'}
		}
		const alipayURL = await alipay([ctx.request.body.orderno], order[0].sumPrice)
		ctx.body = {
			success: true,
			code: '0000',
			payload: {
				alipayURL,
				sumPrice: order[0].sumPrice,
				ordernos: [ctx.request.body.orderno],
			}
		}
	}catch(err) {
		console.error('/api/order/pay_order', err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})

/**
 * @route POST /api/order/comment_picture
 * @params  picture 图片
 * @desc 上传评论图片
 * @access 携带 token 访问
 */
router.post('/comment_picture', koaBody({ multipart: true }), async ctx => {
	// token 验证
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, message: '没有访问权限', code: '1002'}
	}
	const picture = ctx.request.files.picture
	if (!picture || !/^image\//.test(picture.type) || picture.size > 5000000) {
		return ctx.body = {success: false, message: '图片格式错误', code: '1002'}
	}
	try {
		let imgName = tools.randomStr()(picture.name)
		let buf = await tools.moveFile(picture.path, path.join(__dirname, '../../views/image/goods/comment/' + imgName))
		const info = await sharp(buf).resize({ width: 40, height: 40, fit:'inside' }).toFile(path.join(__dirname, `../../views/image/goods/comment/${imgName}_w40.jpg`))
		ctx.body = {success: true, code: '0000', message: 'OK', payload:{
			picture: imgName
		}}
	}catch(err) {
		console.error('/api/order/comment_picture', err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
	
})

/**
 * @route POST /api/order/comment_picture
 * @params type [0,1,2]  comment(string<200)  pictures(arr[max5])  orderDetailId(int)
 * @desc 提交评论
 * @access 携带 token 访问
 */
router.post('/submit_comment', async ctx => {
	// token 验证
	const token = tokenValidator(ctx)
	if (!token.isvalid) {
		return ctx.body = {success: false, message: '没有访问权限', code: '1002'}
	}
	const discuss = ctx.request.body
	if (['0', '1', '2'].indexOf(discuss.type) === -1 ||
		typeof(discuss.comment) !== 'string' ||
		discuss.comment.length > 200 ||
		!/^[1-9]\d*$/.test(discuss.orderDetailId) ||
		!Array.isArray(discuss.pictures) ||
		discuss.length > 5 ||
		!discuss.pictures.reduce((prev, next) => (prev && /^\w{10}_\d{7,9}\.(jpg|jpeg|gif|icon|png)$/.test(next)), true)
	) {
		return ctx.body = {success: false, message: '评论格式有误', code: '1002'}
	}
	try {
		const isPay = await db.executeReader(`select o.isPay from tb_orderDetail od join tb_order o on od.orderno=o.orderno where od._id=${discuss.orderDetailId} limit 1;`)
		if (isPay.length < 1 || isPay[0].isPay.readInt8(0) === 0) {
			return ctx.body = {success: false, message: '意外的错误', code: '1002'}
		}
		const updateOrder = await db.executeNoQuery(`update tb_orderDetail set isComment=1 where _id=${discuss.orderDetailId} and isSend=1 and isSign=1 and isComment=0;`)
		if (updateOrder !== 1) {
			return ctx.body = {success: false, message: '意外的错误', code: '1002'}
		}
		const insertComment = await db.executeNoQuery(`insert into tb_comments(goodDetailId,mid,content,orderDetailId,type,pictures) values((select goodDetailId from tb_orderDetail where _id=${discuss.orderDetailId}),${token.payload.userId},'${discuss.comment}',${discuss.orderDetailId},${discuss.type},'${discuss.pictures.join('@')}');`)
		if (insertComment !== 1) {
			return ctx.body = {success: false, message: '意外的错误', code: '1002'}
		}
		return ctx.body = {success: true, code: '0000', message: 'OK'}
	}catch(err) {
		console.error('/api/order/comment_picture', err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})

module.exports = router.routes()