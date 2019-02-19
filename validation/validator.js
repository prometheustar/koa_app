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

function isInt(value) {
	return /^\d+$/.test(value)
}

function isBit(value) {
	return /^[01]$/.test(value)
}

function searchProductValidator(info) {
	let ans = { isvalid: false, condition: '', message: '接口参数错误' }
	if (typeof(info) !== 'object') return ans;
	let sql = "select g._id,g.goodName,g.logo,g.nowPrice,g.number,g.detailId,g.storeId,s.storeName,s.mid from tb_goods as g join tb_store as s on g.storeId=s._id";
	// 关键字搜索
	if (info.q) {
		sql += ` where g.goodName like '%${info.q}%'`
		ans.condition = 'q'
	}
	// storeId
	if (/^\d+$/.test(info.storeId + '')) {
		sql += ans.condition === 'q' ? ' and' : ' where'
		sql += ` s.storeId = ${info.storeId}`
		ans.condition = 'storeId'
	}
	// 商品分类
	if (/^\d+$/.test(info.detailId + '')) {
		sql += (ans.condition === 'q' || ans.condition === 'storeId') ? ' and' : ' where'
		sql += ` g.detailId = ${info.detailId}`
		ans.condition = 'classify'

	}else if (/^\d+$/.test(info.smaillId + '')) {
		sql += (ans.condition === 'q' || ans.condition === 'storeId') ? ' and' : ' where'
		sql += ` g.smaillId = ${info.smaillId}`
		ans.condition = 'classify'

	}else if (/^\d+$/.test(info.bigId + '')) {
		sql += (ans.condition === 'q' || ans.condition === 'storeId') ? ' and' : ' where'
		sql += ` g.bigId = ${info.bigId}`
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
	return !isEmpty(file) && typeof(file.path) === "string" && /\.(jpg|jpeg|png|gif|svg)$/i.test(file.name)
}

function addProductValidator(info, files) {
	let ans = { isvalid: false, message: '接口参数错误' }
	if (isEmpty(info) || isEmpty(files)) {
		return ans
	}
	if (!isInt(info.detailId) || !isInt(info.storeId) || isEmpty(info.goodName) || isEmpty(info.nowPrice) ||  isEmpty(info.goodFrom)) {
		return ans
	}
	if (!isImg(files.logo)) {
		return ans
	}
	if (typeof(files.goodSmaillPicture) === 'object') {
		files.goodSmaillPicture = Array.isArray(files.goodSmaillPicture) ? files.goodSmaillPicture : [files.goodSmaillPicture]
		for (let i = 0, len = files.goodSmaillPicture.length; i < len; i++) {
			if (!isImg(files.goodSmaillPicture[i])) { return ans }
		}
	}else {
		return ans
	}
	if (typeof(files.goodInfoPicture) === 'object') {
		files.goodInfoPicture = Array.isArray(files.goodInfoPicture) ? files.goodInfoPicture : [files.goodInfoPicture]
		for (let i = 0, len = files.goodInfoPicture.length; i < len; i++) {
			if (!isImg(files.goodInfoPicture[i])) { return ans }
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
	if (info.specName === undefined && 
		Array.isArray(info.goodDetailInfo) &&
		info.goodDetailInfo.length === 1 &&
		typeof(info.goodDetailInfo[0]) === 'object' &&
		isInt(info.goodDetailInfo[0].amount) &&
		isInt(info.goodDetailInfo[0].price)
		) {
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
		for (let i = 0, len = info.goodDetailInfo.length; i < len; i++) {
			if (!(typeof(info.goodDetailInfo[i]) === 'object' &&
				(info.goodDetailInfo[i].isDisable || (isInt(info.goodDetailInfo[i].amount) && isInt(info.goodDetailInfo[i].price))))
			) {
				return ans
			}
		}
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
module.exports = {
	isLength: validator.isLength,
	equals: validator.equals,
	isEmail: validator.isEmail,
	isEmpty,
	isPhone,
	searchProductValidator,
	addProductValidator
}