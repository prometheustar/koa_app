const db = require('../../config/mysqldb')
const validator = require('../../validation/validator')

// 获取购物车信息
exports.getShopCarInfo = async ws => {
	try {
		const userId = ws._sender._socket.token.userId
		let shopCar = await db.executeReaderMany({
			products: `select shop._id as shopCarId,shop.number,gd._id as goodDetailId,gd.price,gd.amount,store._id as storeId,store.storeName,store.nickname,g.goodName,g.logo,g._id as goodId from tb_shopCar shop join tb_goodDetail gd on shop.goodDetailId=gd._id join tb_goods g on gd.goodId=g._id join tb_store store on g.storeId=store._id where shop.mid=${userId} and shop.isBuy=0 and store.storeStatus=0 and g.state=0 order by shop.creaTime desc`,
			specValue: `select sp._id as shopId,sn.specName,sv.specValue from tb_shopCar as sp
				join tb_goodDetail as gd on sp.goodDetailId=gd._id
				join tb_goodSpecConfig as sc on sc.goodId=gd.goodId and gd.indexx=sc.detailIndex
				join tb_SpecName as sn on sn.goodId=gd.goodId and sn.indexx=sc.specNameIndex
				join tb_SpecValue as sv on sv.goodId=gd.goodId and sv.indexx=sc.specValueIndex
				where sp.mid=${userId} and sp.isBuy=0 order by sp.creaTime desc;`
		})
		let shopCarInfo = []
		let start = 0;
		for (let i = 0, len = shopCar.products.length; i < len; i++) {
			shopCarInfo[i] = {product:shopCar.products[i], spec:[]}
			for (let j = start; j < shopCar.specValue.length; j++) {
				if (shopCar.specValue[j].shopId === shopCar.products[i].shopCarId) {
					shopCarInfo[i].spec.push({
						specName: shopCar.specValue[j].specName,
						specValue: shopCar.specValue[j].specValue
					})
					start = j;
				}
			}
		}

		ws.send(JSON.stringify({
			type: 'get_shop_cat',
			origin: 'koa',
			target: userId,
			content: shopCarInfo
		}))
	}catch(err) {
		console.error('ws/users/shopingcarinfo', err.message)
	}
}

// 购物车添加商品
exports.addShopCarProduct = async (ws, info) => {
	if (!/^[1-9]\d*$/.test(info.content.goodDetailId) || !/^[1-9]\d*$/.test(info.content.number)) {
		return
	}
	try {
		const shopCar = await db.executeReader(`select _id from tb_shopCar where mid=${ws._sender._socket.token.userId} and goodDetailId=${info.content.goodDetailId};`)
		let update = 0;
		let insert = 0;
		if (shopCar.length > 0) {
			// 购物车商品已存在，加数量
			update = await db.executeNoQuery(`update tb_shopCar set number=number+${info.content.number} where _id=${shopCar[0]._id};`)
		}else {
			// 不存在新建
			insert = await db.executeNoQuery(`insert into tb_shopCar(mid,goodDetailId,number) values(${ws._sender._socket.token.userId},${info.content.goodDetailId},${info.content.number});`)
		}
		if (insert > 0 || update > 0) {
			exports.getShopCarInfo(ws)
		}
	}catch(err) {
		console.error('ws/users/shopingcarinfo', err.message)
	}
}

// 购物车商品数量减一
exports.shopCarNumberMinus = async (ws, info) => {
	if (!/^[1-9]\d*$/.test(info.content)) return
	try {
		let update = await db.executeNoQuery(`update tb_shopCar set number=number-1 where mid=${ws._sender._socket.token.userId} and _id=${info.content} and number>1;`)
		if (update > 0) {
			exports.getShopCarInfo(ws)
		}
	}catch(err) {
		console.error('ws/users/shopCarNumberMinus', err.message)
	}
}

// 购物车商品数量加一
exports.shopCarNumberPlus = async (ws, info) => {
	let shopCarId = info.content
	if (!/^[1-9]\d*$/.test(shopCarId)) return
	try {
		let amount = await db.executeReader(`select amount from tb_goodDetail where _id=(select goodDetailId from tb_shopCar where _id=${shopCarId} and mid=${ws._sender._socket.token.userId});`)
		if (amount.length < 1) return
		let update = await db.executeNoQuery(`update tb_shopCar set number=number+1 where _id=${shopCarId} and mid=${ws._sender._socket.token.userId} and number<${amount[0].amount};`)
		if (update > 0) {
			exports.getShopCarInfo(ws)
		}
	}catch(err) {
		console.error('ws/users/shopCarNumberPlus', err.message)
	}
}

// 删除购物车商品
exports.deleteShopCarProduct = async (ws, info) => {
	if (!/^[1-9]\d*$/.test(info.content)) return
	try {
		let cancel = await db.executeNoQuery(`delete from tb_shopCar where _id=${info.content} and mid=${ws._sender._socket.token.userId};`)
		if (cancel > 0) {
			exports.getShopCarInfo(ws)
		}
	}catch(err) {
		console.error('ws/users/deleteShopCarProduct', err.message)
	}
}

// 获取消息记录
exports.initChatMessage = async (ws) => {
	let userId = ws._sender._socket.token.userId
	let result = []
	try {
		result = await db.executeReaderMany({
			messages: `SELECT c.isRead,c.sender, c.receiver,c.content,c.creaTime,m.avatar as senderAvatar,m.nickname as senderNickname,m2.avatar as receiverAvatar,m2.nickname as receiverNickname FROM tb_chat c JOIN tb_member m ON c.sender = m._id JOIN tb_member m2 ON c.receiver = m2._id 
				WHERE(c.receiver = ${userId}
					AND c.isRead = 0)
					or c.sender=${userId}
				ORDER BY
					c.creaTime asc
					LIMIT 100;`
		})
	}catch(err) {
		return console.error('ws/users/initChatMessage', err.message)
	}
		// 整合消息
	let messages = [{}]
	let senderIsMe = false;
	for (let i = 0, length = result.messages.length; i < length; i++) {
		for (let j = 0, len = messages.length; j < len; j++) {
			if (result.messages[i].receiver === messages[j].userId || result.messages[i].sender === messages[j].userId) {
				messages[j].content.push({
					sender: result.messages[i].sender,
					msg: result.messages[i].content,
					creaTime: result.messages[i].creaTime
				})
				if (result.messages[i].receiver === userId && result.messages[i].isRead.readInt8(0) === 0) {
					messages[j].notRead = messages[j].notRead ? messages[j].notRead + 1 : 1
				}
				break
			}
			if (j === len-1) {
				senderIsMe = result.messages[i].sender === userId
				let item = {
					userId: senderIsMe ? result.messages[i].receiver : result.messages[i].sender,
					avatar: senderIsMe ? result.messages[i].receiverAvatar : result.messages[i].senderAvatar,
					nickname: senderIsMe ? result.messages[i].receiverNickname : result.messages[i].senderNickname,
					notRead: !senderIsMe && result.messages[i].isRead.readInt8(0) === 0 ? 1 : 0,
					content: [{
						sender: result.messages[i].sender,
						msg: result.messages[i].content,
						creaTime: result.messages[i].creaTime,
					}]
				}
				if (i === 0) { messages[0] = item }else {messages.push(item)}
			}
		}
	}
	ws.send(JSON.stringify({
		type: 'init_chat_messages',
		origin: 'koa',
		content: messages
	}))
}

// 获取联系人列表
exports.getContacts = async (ws, wss) => {
	try {
		const contacts = await db.executeReader(`select m.nickname,m.avatar,m._id as contactId from tb_contacts c join tb_member m on c.contacts=m._id where c.userId=${ws._sender._socket.token.userId};`)
		for (let i = 0, len = contacts.length; i < len; i++) {
			contacts[i].isOnline = !!wss.isOnline(contacts[i].contactId)
		}
		ws.send(JSON.stringify({
			type: 'get_contacts',
			content: contacts
		}))
	}catch(err) {
		console.error('ws/users/getContacts', err.message)
	}
}

exports.addContacts = async (ws, info, wss) => {
	try {
		const isExist = await db.executeReader(`select count(1) as count from tb_contacts where userId=${ws._sender._socket.token.userId} and contacts=${info.content};`)
		console.log(isExist)
		if (isExist[0].count > 0) { return }
		const insert = await db.executeNoQuery(`insert into tb_contacts(userId,contacts) values(${ws._sender._socket.token.userId},${info.content});`)
		if (insert > 0) {
			exports.getContacts(ws, wss); // 刷新联系人列表
		}
	}catch(err) {
		console.error('ws/users/addContacts', err.message)
	}
}
// 将消息转为已读
exports.messageBeRead = (ws, info) => {
	try {
		db.executeNoQuery(`update tb_chat set isRead=1 where sender=${info.content} and receiver=${ws._sender._socket.token.userId};`)
	}catch(err) {
		console.error('ws/users/messageBeRead', err.message)
	}
}

// 获取收货地址
exports.getAddress = async (ws) => {
	try {
		const address = await db.executeReader(`select _id,mid,receiveName,address,phone,postcode,isDefault from tb_address where mid=${ws._sender._socket.token.userId} and isDrop=0;`)
		for (let i = 0, len = address.length; i < len; i++) {
			address[i].isDefault = address[i].isDefault.readInt8(0)
		}
		ws.send(JSON.stringify({
			type: 'get_address',
			content: address
		}))
	}catch(err) {
		console.error('/ws/users/getAddress', err.message)
	}
}

// 删除收货地址
exports.deleteAddress = async (ws, info) => {
	if (!info || !validator.isInt(info.content)) return;
	try {
		const drop = await db.executeNoQuery(`update tb_address set isDrop=1 where _id=${info.content} and mid=${ws._sender._socket.token.userId};`)
		if (drop > 0) {
			exports.getAddress(ws)
		}
	}catch(err) {
		console.error('/ws/users/deleteAddress', err.message)
	}
}

/**
 * 保存收货地址
 * @param editState -1 添加，>-1修改
 * @return {[type]}      [description]
 */
exports.saveAddress = async (ws, info) => {
	const ads = info.content
	if (validator.isEmpty(ads) ||
		!/\d+/.test(ads.editState) ||
		!validator.isLength(ads.detailAddress,{min:5,max:200}) ||
		!validator.isLength(ads.receiveName, {min: 2, max: 10}) ||
		!validator.isPhone(ads.receivePhone) ||
		!/^[1-9]\d{5}$/.test(ads.postcode)
	) {
		return
	}
	try {
		// 如果当前地址是默认地址，修改其他为非默认
		if (ads.isDefault) {
			await db.executeNoQuery(`update tb_address set isDefault=0 where mid=${ws._sender._socket.token.userId};`)
		}
		let result;
		if (ads.editState === -1) {
			result = await db.executeNoQuery(`insert into tb_address(mid,receiveName,address,phone,postcode,isDefault) values(${ws._sender._socket.token.userId},'${ads.receiveName}','${ads.detailAddress}','${ads.receivePhone}','${ads.postcode}',${ads.isDefault ? 1 : 0});`)
		}else {
			result = await db.executeNoQuery(`update tb_address set receiveName='${ads.receiveName}',address='${ads.detailAddress}',phone='${ads.receivePhone}',postcode='${ads.postcode}',isDefault=${ads.isDefault ? 1 : 0} where mid=${ws._sender._socket.token.userId} and _id=${ads.editState};`)
		}
		if (result > 0) {
			exports.getAddress(ws)
		}
	}catch(err) {
		console.error('/ws/users/saveAddress', err.message)
	}
}
