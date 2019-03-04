const db = require('../../config/mysqldb')

// 获取购物车信息
module.exports.getShopCarInfo = async ws => {
	try {
		const userId = ws._sender._socket.token.userId
		let shopCar = await db.executeReaderMany({
			products: `select shop._id as shopCarId,shop.number,gd._id as goodDetailId,gd.price,gd.amount,store._id as storeId,store.storeName,store.nickname,g.goodName,g.logo,g._id as goodId from tb_shopCar shop join tb_goodDetail gd on shop.goodDetailId=gd._id join tb_goods g on gd.goodId=g._id join tb_store store on g.storeId=store._id where shop.mid=${userId} and store.storeStatus=0 and g.state=0 order by shop.creaTime desc`,
			specValue: `select sp._id as shopId,sn.specName,sv.specValue from tb_shopCar as sp
				join tb_goodDetail as gd on sp.goodDetailId=gd._id
				join tb_goodSpecConfig as sc on sc.goodId=gd.goodId and gd.indexx=sc.detailIndex
				join tb_SpecName as sn on sn.goodId=gd.goodId and sn.indexx=sc.specNameIndex
				join tb_SpecValue as sv on sv.goodId=gd.goodId and sv.indexx=sc.specValueIndex
				where sp.mid=${userId} order by sp.creaTime desc;`
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
module.exports.addShopCarProduct = async (ws, info) => {
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
			module.exports.getShopCarInfo(ws)
		}
	}catch(err) {
		console.error('ws/users/shopingcarinfo', err.message)
	}
}

// 购物车商品数量减一
module.exports.shopCarNumberMinus = async (ws, info) => {
	if (!/^[1-9]\d*$/.test(info.content)) return
	try {
		let update = await db.executeNoQuery(`update tb_shopCar set number=number-1 where mid=${ws._sender._socket.token.userId} and _id=${info.content} and number>1;`)
		if (update > 0) {
			module.exports.getShopCarInfo(ws)
		}
	}catch(err) {
		console.error('ws/users/shopCarNumberMinus', err.message)
	}
}

// 购物车商品数量加一
module.exports.shopCarNumberPlus = async (ws, info) => {
	let shopCarId = info.content
	if (!/^[1-9]\d*$/.test(shopCarId)) return
	try {
		let amount = await db.executeReader(`select amount from tb_goodDetail where _id=(select goodDetailId from tb_shopCar where _id=${shopCarId} and mid=${ws._sender._socket.token.userId});`)
		if (amount.length < 1) return
		let update = await db.executeNoQuery(`update tb_shopCar set number=number+1 where _id=${shopCarId} and mid=${ws._sender._socket.token.userId} and number<${amount[0].amount};`)
		if (update > 0) {
			module.exports.getShopCarInfo(ws)
		}
	}catch(err) {
		console.error('ws/users/shopCarNumberPlus', err.message)
	}
}

// 删除购物车商品
module.exports.deleteShopCarProduct = async (ws, info) => {
	if (!/^[1-9]\d*$/.test(info.content)) return
	try {
		let cancel = await db.executeNoQuery(`delete from tb_shopCar where _id=${info.content} and mid=${ws._sender._socket.token.userId};`)
		if (cancel > 0) {
			module.exports.getShopCarInfo(ws)
		}
	}catch(err) {
		console.error('ws/users/deleteShopCarProduct', err.message)
	}
}