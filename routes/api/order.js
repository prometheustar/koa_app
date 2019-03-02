const KoaRouter = require('koa-router');
const router = new KoaRouter();
const Decimal = require('decimal.js-light')
const md5 = require('md5')

const db = require('../../config/mysqldb.js')
const tools = require('../../config/tools')
const keys = require('../../config/keys')
const alipay = require('../../config/alipay')
const tokenValidator = require('../../validation/tokenValidator')
const validator = require('../../validation/validator')
const socket = require('../ws/wsserver')

// 设置 Decimal 计算精度
Decimal.set({
  precision: 10,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21
});

/**
 * @route GET /api/order/submit_order
 * @props  goodDetailIds(intArr) numbers(intArr) messages(stringArr) addressId(int)
 * @access 携带 token 访问
 */
router.post('/submit_order', async ctx => {
	// token 验证
	const tokenValid = tokenValidator(ctx)
	if (!tokenValid.isvalid) {
		return ctx.body = {success: false, message: '没有访问权限', code: '1002'}
	}
	// 接口参数验证
	const param = ctx.request.body
	const orderValid = validator.submitOrderValidator(param)
	if (!orderValid.isvalid) {
		return ctx.body = {success: false, message: orderValid.message, code: '1002'}
	}
	// 验证通过，插入数据库
	const orderno = tools.getOrderno()
	let goodDetailSql = []
	// 根据 detailId 查询商品详情
	for (let i = 0, len = param.goodDetailIds.length; i < len; i++) {
		goodDetailSql[i] = `select _id,amount,price from tb_goodDetail where _id=${param.goodDetailIds[i]} and state=0 and amount>0;`
	}
	try {
		// 进行地址验证，必须是登录用户自己的收货地址
		goodDetailSql.address = `select _id from tb_address where _id=${param.addressId} and mid=${tokenValid.payload.userId};`
		const goodDetailAns = await db.executeReaderMany(goodDetailSql)
		if (goodDetailAns.address.length < 1) {
			return ctx.body = {success: false, message: '收货地址异常', code: '1011'}
		}
		// 验证结果，生成 insertOrderDetailSql
		let insertOrderDetailSql = 'insert into tb_orderDetail(orderno,goodDetailId,price,number,message) values'
		let updateGoodDetail = [] // 更新库存量
		let sumPrice = new Decimal(0)  // 使用 Decimal 计算价格
		for (let i = 0, len = param.numbers.length; i < len; i++) {
			if (goodDetailAns[i].length < 1 || goodDetailAns[i][0].amount < param.numbers[i]) {
				return ctx.body = {success: false, message: '商品未在售或数量超过库存', code: '1002'}
			}
			updateGoodDetail[i] = `update tb_goodDetail set amount=amount-${param.numbers[i]} where _id=${goodDetailAns[i][0]._id};`
			let end = i === len-1 ? ';' : ','
			let price = new Decimal(goodDetailAns[i][0].price).times(param.numbers[i])
			sumPrice = sumPrice.plus(price)
			insertOrderDetailSql += `('${orderno}',${goodDetailAns[i][0]._id},${price.toNumber()},${param.numbers[i]},'${param.messages[i]}')${end}`
		}
		if (!/^[1-9]\d*(\.\d{1,2}|)$/.test(sumPrice.toString())) {
			return ctx.body = {success: false, message: '订单生成失败', code: '9999'}
		}
		// 生成 insertOrderSql
		let insertOrderSql = `insert into tb_order(orderno,mid,sumPrice,addressId) values('${orderno}',${tokenValid.payload.userId},${sumPrice.toNumber()},${param.addressId});`
		// 执行插入语句
		const insertAns = await db.executeNoQueryMany({
			...updateGoodDetail,  // goodDetail 库存减一
			orderDetailAns: insertOrderDetailSql,  // lenth = param.numbers.length
			orderAns: insertOrderSql,
		})
		// console.log({
		// 	...updateGoodDetail,  // goodDetail 库存减一
		// 	orderDetailAns: insertOrderDetailSql,  // lenth = param.numbers.length
		// 	orderAns: insertOrderSql,
		// })
		// 执行成功后返回付款二维码，金额
		const alipayURL = await alipay(orderno, sumPrice.toNumber())
		ctx.body = {
			success: true,
			code: '0000',
			payload: {
				alipayURL,
				sumPrice,
				orderno,
			}
		}
	}catch(err) {
		console.error('/api/users/submit_order', err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})

// 支付宝支付成功回调接口
// 验证 app_id, passback_params md5(orderno + secret), trade_status: TRADE_SUCCESS
// https://docs.open.alipay.com/270/105902/
router.post('/alipay_notify', async ctx => {
	const result = ctx.request.body
	// 验证
	if (result.app_id !== keys.alipayAppId || 
		result.trade_status !== 'TRADE_SUCCESS' ||
		md5(result.out_trade_no + keys.alipaySecret) !== result.passback_params
		) {
		return
	}
	// 支付成功，改订单表已付款，ws 通知网页，确认收货后；卖家账号余额+sum
	try {
		const sql = await db.executeReaderMany({
			update: `update tb_order set isPay=1 where orderno='${result.out_trade_no}';`,
			member: `select mid from tb_order where orderno='${result.out_trade_no}';`
		})
		if (sql.member.length < 1 || sql.update.affectedRows < 1 || socket.wss === null) {
			console.log('/alipay_notify', sql)
		}
		socket.wss.sendMsg({
			type: 'payOrderSuccess',
			origin: 'koa',
			target: sql.member[0].mid,
			content: result.out_trade_no
		})
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
	if (!/^[1-9]\d*$/.test(info.goodId) || !/^[01]$/.test(info.state)) {
		return ctx.body = {success: false, message: '接口参数错误', code: '1002'}
	}
	try {
		const result = db.executeNoQuery(`update tb_goods set state=${info.state} where _id=${info.goodId} and checkstate=1;`)
		if (result !== 1) 
			return ctx.body = {success: false, message: '商品不存在或审核不通过', code: '1002'}

		ctx.body = {success: true, code: '0000', message: 'OK'}
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
		const result = db.executeNoQuery(`update tb_orderDetail set isSend=1,postWay='${info.postWay}',expNumber='${info.expNumber}' where _id=${info.orderDetailId};`)
		if (result < 1) {
			return ctx.body = {success: false, message: '订单不存在', code: '1002'}
		}
		ctx.body = {success: true, code: '0000', message: 'OK'}
	}catch(err) {
		console.error('/api/order/send_product', err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})

router.post('/test', async ctx => {
	socket.wss.sendGroup(ctx.request.body.message)
	// ctx.body = await alipay(tools.getOrderno(), '10.00')
	ctx.body = 'ok'
})

module.exports = router.routes()