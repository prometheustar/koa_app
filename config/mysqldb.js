/**
 * 连接 mysql
 * 提供 executeReader 方法执行 select
 * 提供 executeNoQuery 方法执行 update insert delete 语句
 */
const mysql = require('mysql');
const keys = require('./keys.js');

// 创建连接池，最多10个并行连接。
const pool = mysql.createPool({
	connectionLimit : 10,
	host: keys.mysqlhost,
	user: keys.mysqluser,
	password: keys.mysqlpwd,
	database: 'Choice_Perfect',
	charset: 'utf8'
});

/**
 * 传入 select sql语句
 * 返回查询结果集  对象数组
 */
function executeReader(sql_str) {
	return new Promise((resolve, reject) => {
		// 获得连接
		pool.getConnection((err, connection) => {
			if (err) return reject(err);
			connection.query(sql_str, (err, results, _) => {
				connection.release();  // 释放连接回连接池
				if (err) return reject(err);
				resolve(results);
			});
		});
	});
}

/**
 * ExecuteNoQuery 
 * 传入 update delete insert sql 语句
 * 返回受影响的行数
 */
function executeNoQuery(sql_str) {
	return new Promise((resolve, reject) => {
		executeReader(sql_str)
			.then(result => {
				resolve(result.affectedRows);
			})
			.catch(err => {
				reject(err);
			});
	});
}
module.exports = {
	executeReader,
	executeNoQuery
}

/*
  OkPacket {
  fieldCount: 0,
  affectedRows: 2,
  insertId: 9,
  serverStatus: 2,
  warningCount: 0,
  message: '&Records: 2  Duplicates: 0  Warnings: 0',
  protocol41: true,
  changedRows: 0 }
 */

 /**
  * 因 mysql 版本太高，密码验证方式更新，客户端版本太低，手动修改密码验证方式
  * ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'yourpassword';
  */
	 