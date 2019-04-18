/**
 * 连接 mysql
 * 提供 executeReader 方法执行 select
 * 提供 executeNoQuery 方法执行 update insert delete 语句
 */
const mysql = require('mysql');
const keys = require('./keys.js');

// 创建连接池，最多10个并行连接。
const pool = mysql.createPool({
	connectionLimit : 15,
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
			if (err) return reject(err)
			connection.query(sql_str, (err, results, _) => {
				connection.release();  // 释放连接回连接池
				if (err) return reject(err)
				resolve(results);
			});
		});
	});
}

/**
 * executeReaderMany
 * 传入对象，{ product: 'select xx' }
 * 返回结果集
 */
function executeReaderMany(sql_strs) {
	return new Promise((resolve, reject) => {
		let key;
		let results = {};
		for (key in sql_strs) {
			(function(){
				const sql_key = key
				// 获得连接
				pool.getConnection((err, connection) => {
					if (err) return reject(err);
					connection.query(sql_strs[sql_key], (err, ans, _) => {
						connection.release();  // 释放连接回连接池
						if (err) return reject(err);
						results[sql_key] = ans
						end = true
						for (let i in sql_strs) {
							if (results[i] === undefined) {
								end = false
								break;
							}
						}
						if (end) resolve(results);
					});
				});
			}())
		}
	})
}

/**
 * ExecuteNoQuery 
 * 传入 update delete insert sql 语句
 * 返回受影响的行数
 */
function executeNoQuery(sql_str, callback) {
	return new Promise((resolve, reject) => {
		executeReader(sql_str)
			.then(result => {
				if (typeof(callback) === 'function') {
					callback(null, result.affectedRows)
				}
				resolve(result.affectedRows);
			})
			.catch(err => {
				if (typeof(callback) === 'function') {
					callback(err)
				}
				reject(err);
			});
	});
}

/**
 * executeNoQueryMany
 * 传入对象，{ product: 'select xx' }
 * 返回受影响的行数对象
 */
function executeNoQueryMany(sql_strs) {
	return new Promise((resolve, reject) => {
		let key;
		let results = {};
		for (key in sql_strs) {
			(function() {
				const sql_key = key
				// 获得连接
				pool.getConnection((err, connection) => {
					if (err) return reject(err);
					connection.query(sql_strs[sql_key], (err, ans, _) => {
						connection.release();  // 释放连接回连接池
						if (err) return reject(err);
						results[sql_key] = ans.affectedRows
						end = true
						for (let i in sql_strs) {
							if (results[i] === undefined) {
								end = false
								break;
							}
						}
						if (end) resolve(results);
					});
				});
			}())
		}
	})
}



/**
 * 利用递归顺序执行 handlers 函数数组
 * @param  {函数数组}   handlers  待执行的函数数组
 * @param  {对象或数组}   initState 会依次传给待执行的函数
 * @param  {函数} callback  执行完调用或，传给函数的时候调用
 */
function compose(handlers, state, callback) {
	function dispatch(state, i) {
		if (i >= handlers.length) { return callback(null, state) }
		// (state, next, callback)
		handlers[i](state, dispatch.bind(null, state, i + 1), callback)
	}
	dispatch(state, 0)
}


/**
 * 事务执行处理
 * 传入sql 数组，判断是否回滚函数
 * 返回是否执行成功，{success: true} 或 抛出错误
 */
function executeTransaction(sqls, judge) {
	return new Promise((resolve, reject) => {
		if (!Array.isArray(sqls) || sqls.length === 0) throw new TypeError('sqls 必须是非空的 DML SQL 语句数组!')
		judge = typeof(judge) === 'function' ? judge : () => true
		pool.getConnection((err, connection) => {
			// 开始事务
			connection.beginTransaction(function(err) {
			    if (err) {
				    return reject(err)
			    }
				var querys = []
			    for (let i = 0; i < sqls.length; i++) {
			    	querys[i] = (function(index) {
						return (status, next, callback) => {
							connection.query(sqls[index], function(err, ans, _) {
								if (err) {
									return callback(err, status) // 执行失败，调用回调函数
								}
								status[index] = ans.affectedRows
								next() // 执行下一个 SQL
							})
				    	}
			    	}(i))
			    }
			     // 利用中间件执行，querys 函数数组
			     try {
					compose(querys, [], (err, queryAns) => {
						// 执行有错误或，执行结果与执行 SQL 数组长度不同，回滚
				    	if (err || queryAns.length !== sqls.length) {
							connection.rollback()
							connection.release()
							return reject(err || new Error('意外的错误'))
				    	}
						for (let i = 0; i < queryAns.length; i++) {
							// 根据判断函数决定是否回滚
							if (!judge(queryAns[i], i)) {
								connection.rollback()
								connection.release()
								return resolve({ success: false, sqlIndex: i })
							}
						}
						// 执行成功，提交事务
						connection.commit()
						connection.release()
						resolve({ success: true })
				    })
			     }catch(err) {
			     	// 报错，回滚
					connection.rollback()
					connection.release()
					resolve(err)
			     }
		    })
		})
	})
}


module.exports = {
	executeReader,
	executeNoQuery,
	executeReaderMany,
	executeNoQueryMany,
	executeTransaction
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
	 