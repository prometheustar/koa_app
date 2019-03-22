const validator = require('validator');

function isEmpty(value) {
	return value === undefined || value === null ||
		(typeof value === "object" && Object.keys(value).length === 0) ||
		(typeof value === "string" && value.trim().length === 0)
}
function isPhone(value) {
	return typeof value === 'string' && 
		!isEmpty(value) && 
		/^[1][\d]{10}$/.test(value);
}

const isLength = (value, opts) => {
	if (typeof value !== 'string') return false;
	return (value.length >= opts.min && value.length <= opts.max)
}

function isEmail(email) {
	return /^[A-z\d]+([-_.][A-z\d]+)*@([A-z\d]+[-.])+[A-z\d]{2,4}$/.test(email)
}

function isInt(value) {
	return /^\d+$/.test(value)
}

function isNumber(value) {
	return /^\d+(\.\d+|)$/.test(value)
}

function isBit(value) {
	return /^[01]$/.test(value)
}

function searchProductValidator(info) {
	let ans = { isvalid: false, condition: '', message: '接口参数错误' }
	if (typeof(info) !== 'object') return ans;
	let sql = "select g._id,g.goodName,g.logo,g.nowPrice,g.number,g.detailId,g.storeId,s.storeName,s.mid from tb_goods as g join tb_store as s on g.storeId=s._id where g.checkstate=1 and s.isAudit=1 and s.storeStatus=0";
	// 关键字搜索
	if (info.q) {
		sql += ` and g.goodName like '%${info.q}%'`
		ans.condition = 'q'
	}
	// storeId
	if (/^\d+$/.test(info.storeId + '')) {
		// sql += ans.condition === 'q' ? ' and' : ' where'
		sql += ` and g.storeId = ${info.storeId}`
		ans.condition = 'storeId'
	}
	// 商品分类
	if (/^\d+$/.test(info.detailId + '')) {
		// sql += (ans.condition === 'q' || ans.condition === 'storeId') ? ' and' : ' where'
		sql += ` and g.detailId = ${info.detailId}`
		ans.condition = 'classify'

	}else if (/^\d+$/.test(info.smaillId + '')) {
		// sql += (ans.condition === 'q' || ans.condition === 'storeId') ? ' and' : ' where'
		sql += ` and g.smaillId = ${info.smaillId}`
		ans.condition = 'classify'

	}else if (/^\d+$/.test(info.bigId + '')) {
		// sql += (ans.condition === 'q' || ans.condition === 'storeId') ? ' and' : ' where'
		sql += ` and g.bigId = ${info.bigId}`
		ans.condition = 'classify'
	}
	// 参数不对
	if (ans.condition === '') return ans;
	
	// order by
	if (info.order === 'price' || info.order === 'number') {
		// 按价格或销量排序
		sql += info.order === 'price' ? ' order by g.price' : info.order === 'number' ? ' order by g.number' : '';
		// 默认降序
		sql += info.sort === 'asc' ? ' asc' : ' desc'
	}
	// 查询条数限制 limit
	sql = sql + ` limit ` + (/^\d+$/.test(info.limit1) ? info.limit1 + ',' : '') +
			(/^\d+$/.test(info.limit2) ? info.limit2 : 10); // 默认返回 10 条
	ans.sql = sql
	ans.isvalid = true
	return ans;
}

/**
 * token: loginToken
 * tb_goods: detailId, storeId, goodName, goodFrom, nowPrice, logo(文件)
 * tb_goodsmaillPicture: goodId,link(fileName)(文件) 小图片组，数组
 * tb_goodPicture: goodId,link(fileName) 商品介绍图片组
 *
 * tb_SpecName: specName, goodId, indexx
 * tb_SpecValue: goodId, specNameIndex, specValue, indexx
 *
 * tb_goodSpecConfig 关系映射表，自动生成
 */
function isImg(file) {
	return !isEmpty(file) && typeof(file.path) === "string" && /\.(jpg|jpeg|png|gif|svg)$/i.test(file.name) && file.size < 3*1024*1024
}

function addProductValidator(info, files) {
	let ans = { isvalid: false, message: '接口参数错误' }
	if (isEmpty(info) || isEmpty(files)) {
		return ans
	}
	if (!isInt(info.detailId) || !isInt(info.storeId) || isEmpty(info.goodName) ||  isEmpty(info.goodFrom)) {
		return ans
	}
	if (!isImg(files.logo)) {
		ans.message = '图片格式有误，支持3M以内的图片'; 
		return ans
	}
	if (typeof(files.goodSmaillPicture) === 'object') {
		files.goodSmaillPicture = Array.isArray(files.goodSmaillPicture) ? files.goodSmaillPicture : [files.goodSmaillPicture]
		for (let i = 0, len = files.goodSmaillPicture.length; i < len; i++) {
			if (!isImg(files.goodSmaillPicture[i])) { ans.message = '图片格式有误，支持3M以内的图片'; return ans }
		}
	}else {
		return ans
	}
	if (typeof(files.goodInfoPicture) === 'object') {
		files.goodInfoPicture = Array.isArray(files.goodInfoPicture) ? files.goodInfoPicture : [files.goodInfoPicture]
		for (let i = 0, len = files.goodInfoPicture.length; i < len; i++) {
			if (!isImg(files.goodInfoPicture[i])) { ans.message = '图片格式有误，支持3M以内的图片';  return ans }
		}
	}else {
		return ans
	}
	// 判断商品分类参数
	try {
		// 转换 JSON 数据
		if (typeof(info.specName) === "string") {
			info.specName = JSON.parse(info.specName)
			info.specValue = JSON.parse(info.specValue)
		}
		info.goodDetailInfo = JSON.parse(info.goodDetailInfo)
	}catch (err) {
		return ans
	}
	// 商品没有属性分类
	if (isEmpty(info.specName) && 
		Array.isArray(info.goodDetailInfo) &&
		info.goodDetailInfo.length > 0 &&
		typeof(info.goodDetailInfo[0]) === 'object' &&
		isInt(info.goodDetailInfo[0].amount) &&
		isNumber(info.goodDetailInfo[0].price)
		) {
		info.nowPrice = info.goodDetailInfo[0].price
		ans.isvalid = true
		ans.message = 'OK'
		return ans
	}else {
		// 商品有属性分类
		if (!Array.isArray(info.specName) || 
			!Array.isArray(info.specValue) || 
			info.specName.length !== info.specValue.length || 
			!Array.isArray(info.goodDetailInfo) 
			) {
			return ans
		}
		let nowPrice = 99999999;
		for (let i = 0, len = info.goodDetailInfo.length; i < len; i++) {
			if (!(typeof(info.goodDetailInfo[i]) === 'object' &&
				(isInt(info.goodDetailInfo[i].amount) && isNumber(info.goodDetailInfo[i].price)))
			) {
				return ans
			}else {
				if (info.goodDetailInfo[i].price < nowPrice) {
					nowPrice = info.goodDetailInfo[i].price
				}
			}
		}
		info.nowPrice = nowPrice
		let detailLen = 1;
		for (let i = 0, len = info.specValue.length; i < len; i++) {
			if (!Array.isArray(info.specValue[i])) {
				return ans
			}
			detailLen *= info.specValue[i].length
		}
		if (info.goodDetailInfo.length !== detailLen) {
			return ans
		}
	}
	ans.isvalid = true
	ans.message = 'OK'
	return ans
}

// api/users/submit_order 参数验证
// goodDetailIds(intArr)  numbers(intArr) addressId(int)
function submitOrderValidator(info) {
	let ans = { isvalid: false, message: '订单数据有误' }
	if (isEmpty(info)) { return ans }
	if (!Array.isArray(info.goodDetailIds) || info.goodDetailIds.length < 1) {
		return ans
	}
	if (!/^[1-9]\d*$/.test(info.addressId)) {
		return ans
	}
	if (!Array.isArray(info.numbers) ||
		info.numbers.length < 1 ||
		info.numbers.length !== info.goodDetailIds.length ||
		!Array.isArray(info.messages) ||
		info.messages.length !== info.numbers.length ||
		(Array.isArray(info.shopCarIds) && info.shopCarIds.length !== info.numbers.length)  // 有购物车Ids并且购物车长度不匹配
	) {
		return ans
	}else {
		let comeFromShopCar = false
		if (Array.isArray(info.shopCarIds)) {
			ans.updateShopCarSQL = 'update tb_shopCar set isBuy=1 where _id in ('
			comeFromShopCar = true
		}
		for (let len = info.numbers.length -1, end = ','; len >= 0; len--) {
			if (!/^[1-9]\d*$/.test(info.numbers[len]) || !/^[1-9]\d*$/.test(info.goodDetailIds[len])) {
				return ans
			}
			// 拼接购物车更新 SQL语句
			if (comeFromShopCar) {
				if (!/^[1-9]\d*$/.test(info.shopCarIds[len])) {
					return ans
				}
				if (len === 0) { end = ');' }
				ans.updateShopCarSQL += `${info.shopCarIds[len]}${end}`
			}
		}
	}
	ans.isvalid = true;
	ans.message = 'OK'
	return ans
}

module.exports = {
	equals: validator.equals,
	isLength,
	isInt,
	isEmail,
	isEmpty,
	isPhone,
	searchProductValidator,
	addProductValidator,
	submitOrderValidator
}