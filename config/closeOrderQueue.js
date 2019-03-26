const db = require('./mysqldb')
const waitCloseQueue = new Set()



const getFirstCloseOrder = () => {
	if (waitCloseQueue.size === 0) return null;
	for (let order of waitCloseQueue) {  // 获取队列中第一个订单
		return order
	}
}

const addCloseOrder = (orderno) => {
	let order = Object.create(null)
	order.orderno = orderno
	order.time = Date.now()
	waitCloseQueue.add(order)
}

// 将订单关闭并还原商品库存
const closeOrder = async (orderno, order) => {
	try {
		const products = await db.executeReader(`select od.goodDetailId,od.number from tb_order o join tb_orderDetail od on o.orderno='${orderno}' and od.orderno='${orderno}' where o.isPay=0 and o.isClose=0;`)
		if (products.length === 0) return;
		let updateSQL = {
			closeOrder: `update tb_order set isClose=1 where orderno='${orderno}' and isPay=0 and isClose=0;`
		}
		for (let i = 0, len = products.length; i < len; i++) {
			updateSQL[i] = `update tb_goodDetail set amount=amount+${products[i].number} where _id=${products[i].goodDetailId};`
		}
		await db.executeNoQueryMany(updateSQL)
		if (order) {
			waitCloseQueue.delete(order)
		}
	}catch(err) {
		console.error('closeOrder', err.message)
	}
}


const initCloseOrders = async function() {
	// 将超过三天的订单关闭
	const closeOrders = await db.executeReader('select orderno from tb_order where isPay=0 and isClose=0 and date_add(creaTime, interval 3 day) <= now();')
	for (let i = 0, len = closeOrders.length; i < len; i++) {
		closeOrder(closeOrders[i].orderno)
	}

	// 查询 未关闭,未支付订单，添加到轮询队列中
	const orders = await db.executeReader('select orderno,creaTime from tb_order where isPay=0 and isClose=0 order by creaTime;')
	for (let i = 0, len = orders.length, order; i < len; i++) {
		order = Object.create(null)
		order.orderno = orders[i].orderno
		order.time = new Date(orders[i].creaTime).getTime()
		waitCloseQueue.add(order)
	}

	// 设置定时器轮询查看关闭任务
	setInterval(function() {
		let order = getFirstCloseOrder()
		if (order === null) return;
		if (Date.now() - 259200000 >= order.time) {
			closeOrder(order.orderno, order)
		}
	}, 10000)
}
initCloseOrders()

exports.addCloseOrder = addCloseOrder