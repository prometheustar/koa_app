const md5 = require('md5')
const keys = require('../config/keys.js')
const db = require('../config/mysqldb.js')

module.exports = async (smsCode, phone, userId) => {
	try {
		let result;
		let ans = {isvalid: false, message: ''}
		if (phone) {
			result = await db.executeReader(`select smsCode from member_sms where phone='${phone}' and date_add(now(),interval -5 minute) < creaTime and creaTime=(select max(creaTime) from member_sms where phone='${phone}' order by creaTime desc);`)
		}else if (userId) {
			result = await db.executeReader(`select s.smsCode,s.phone from member_sms s join tb_member m on s.phone=m.phone where m._id=${userId} and date_add(now(),interval -5 minute) < creaTime and creaTime=(select max(creaTime) from member_sms where phone=m.phone order by creaTime desc);`)
		}else {
			ans.message = '参数错误'
			return ans
		}
		if (result.length === 0) {
			ans.message = '验证码过期'
			return ans
		}
		const md5sms = md5(md5(smsCode + keys.secretOrKey) + (phone || result[0].phone))
		if (md5sms !== result[0].smsCode) {
			ans.message = '验证码错误'
			return ans
		}else {
			return {isvalid: true}
		}
	}catch(err) {
		return {isvalid: false, message: 'server busy'}
	}
}