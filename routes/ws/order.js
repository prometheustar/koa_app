const WebSocket = require('ws')
const db = require('../../config/mysqldb')
const validator = require('../../validation/validator')

const sendMessage = (ws, message) => {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message))
	}
}

// 判断订单状态
const judgeOrderState = (order) => {
	return order.isSend.readInt8(0) === 0 ? 'waitSend' :
		order.isSign.readInt8(0) === 0 ? 'waitSign' :
		order.isComment.readInt8(0) === 0 ? 'waitComment' : 'finish'
}

/**
 * 获取用户订单
 */
exports.getOrders = async (ws, info) => {
	if (info.content && !/^\d+$/.test(info.content.limit)) return;
	try {
		const orders = await db.executeReader(`
				select o._id,o.orderno,o.sumPrice,o.isPay,o.creaTime,
				od._id as orderDetailId,od.price,od.number,od.message,od.isSend,od.isSign,od.isComment,od.postWay,od.expNumber,
				g._id as goodId,g.goodName,g.logo,s.storeName,s.mid as sellerId,m.nickname as sellerName,m.avatar as sellerAvatar
				from tb_order o 
				join tb_address ads on o.addressId=ads._id
				join tb_orderDetail od on od.orderno=o.orderno
				join tb_goodDetail gd on od.goodDetailId=gd._id
				join tb_goods g on gd.goodId=g._id
				join tb_store s on g.storeId=s._id
				join tb_member m on s.mid=m._id
				where o.mid=${ws._sender._socket.token.userId} and o.isClose=0 order by o.creaTime desc limit ${info.content.limit || 0},20;
			`)
		const orderLength = orders.length
		if (orderLength === 0) return;
		let o = []
		let status = {
			waitPay: 0,
			waitSend: 0,
			waitSign: 0,
			waitComment: 0,
			finish: 0
		}
		for (let i = 0, len = orders.length, findone, oneself; i < len; i++) {
			findone = o.find(order => order._id === orders[i]._id)
			if (findone) {
				findone.products.push(orders[i])
				// 判断订单状态
				if (findone.isPay === 1) {
					status[judgeOrderState(orders[i])] ++
				}
			}else {
				o.push({
					_id: orders[i]._id,
					orderno: orders[i].orderno,
					sumPrice: orders[i].sumPrice,
					isPay: orders[i].isPay.readInt8(0),
					storeName: orders[i].storeName,
					storeId: orders[i].storeId,
					creaTime: orders[i].creaTime,
					sellerId: orders[i].sellerId,
					sellerName: orders[i].sellerName,
					sellerAvatar: orders[i].sellerAvatar,
					products: [orders[i]]
				})
				// 判断订单状态
				if (orders[i].isPay.readInt8(0) === 0) {
					status.waitPay ++
				}else {
					status[judgeOrderState(orders[i])] ++
				}
			}
			delete orders[i]._id; delete orders[i].orderno; delete orders[i].sumPrice; delete orders[i].isPay; delete orders[i].creaTime
			delete orders[i].storeName; delete orders[i].storeId; delete orders[i].sellerId; delete orders[i].sellerName; delete orders[i].sellerAvatar
			orders[i].isSend = orders[i].isSend.readInt8(0)
			orders[i].isSign = orders[i].isSign.readInt8(0)
			orders[i].isComment = orders[i].isComment.readInt8(0)
		}
		sendMessage(ws, {
			type: 'get_orders',
			content: {
				end: orderLength < 20,
				limit: info.limit || 0,
				status,
				orders: o
			}
		})
	}catch(err) {
		console.error('/ws/users/getOrders', err.message)
	}
}

/**
 *  签收订单，事务处理，不自动提交
 */
exports.signOrder = async (ws, info) => {
	if (!/^\d{18,19}$/.test(info.content.orderno) ||
		!Array.isArray(info.content.detailId) ||
		info.content.detailId.length === 0 ||
		(info.content.limit !== undefined && !/^\d+$/.test(info.content.limit))) { return }
	// step1.拼接SQL语句
	let signSQL = []
	let salesSQL = 'update tb_goods set number=number+1 where _id in (OooO);'
	let salesChild = 'select distinct gd.goodId from tb_orderDetail od join tb_goodDetail gd on od.goodDetailId=gd._id where '
	for (let i = 0, len = info.content.detailId.length, end = ' or '; i < len; i++) {
		if (!/^[1-9]\d*$/.test(info.content.detailId[i])) return;
		if (i === len-1) { end = '' }
		signSQL[i] = `update tb_orderDetail set isSign=1,signTime=now() where orderno='${info.content.orderno}' and _id=${info.content.detailId[i]} and isSend=1 and 1=(select isPay from tb_order where orderno='${info.content.orderno}') and ${ws._sender._socket.token.userId}=(select mid from tb_order where orderno='${info.content.orderno}');`
		salesChild += `od._id=${info.content.detailId[i]}${end}`
	}
	salesSQL = salesSQL.replace('OooO', salesChild)

	// 将订单金额加到卖家账户上
	for (let i = 0, len = info.content.detailId.length, j = signSQL.length; i < len; i++, j++) {
		signSQL[j] = `update tb_member set property=property+(select price from tb_orderDetail where _id=${info.content.detailId[i]}) where _id=(SELECT s.mid FROM tb_orderDetail od JOIN tb_goodDetail gd ON od.goodDetailId = gd._id JOIN tb_goods g ON gd.goodId = g._id JOIN tb_store s ON g.storeId = s._id JOIN tb_order o ON od.orderno = o.orderno WHERE od._id = ${info.content.detailId[i]} AND od.isSend = 1 AND od.isSign = 1 AND o.isPay =1);`
	}
	signSQL[signSQL.length] = salesSQL
	try {
		// return console.log(signSQL[6])
		const signAns = await db.executeTransaction(signSQL, (ans, index) => {
			// 更新销量判断
			if (index === signSQL.length - 1) {
				return ans >= 1
			}
			return ans === 1
		})
		if (signAns.success) {
			return exports.getOrders(ws, info)
		}
		console.error('/ws/users/signOrder 签收失败：', signAns, info.content.orderno)
	}catch (err) {
		console.error('/ws/users/signOrder', err.message)
	}
}