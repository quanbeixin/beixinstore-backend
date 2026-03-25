const pool = require('../utils/db')
const { resolveEnvFile } = require('../utils/loadEnv')

const TAG = '[SEED_MOCK]'

function day(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

async function firstId(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params)
  return rows[0] ? Number(rows[0].id) : null
}

async function upsertBy(conn, table, keySql, keyParams, insertSql, insertParams, updateSql, updateParams) {
  const id = await firstId(conn, `SELECT id FROM ${table} WHERE ${keySql} LIMIT 1`, keyParams)
  if (id) {
    await conn.query(updateSql, [...updateParams, id])
    return id
  }
  const [r] = await conn.query(insertSql, insertParams)
  return Number(r.insertId || 0)
}

async function run() {
  console.log(`[seed] env file: ${resolveEnvFile()}`)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [uRows] = await conn.query(
      `SELECT id, username FROM users
       WHERE username IN ('projectmanger','wegic_member','a1_member')`,
    )
    const users = Object.fromEntries(uRows.map((r) => [r.username, Number(r.id)]))
    if (!users.projectmanger || !users.wegic_member || !users.a1_member) {
      throw new Error('缺少账号 projectmanger/wegic_member/a1_member，停止写入')
    }

    const [pRows] = await conn.query(`SELECT id,name FROM pm_projects WHERE name IN ('Wegic','A1')`)
    const projects = Object.fromEntries(pRows.map((r) => [r.name, Number(r.id)]))
    if (!projects.Wegic || !projects.A1) throw new Error('缺少项目 Wegic/A1，停止写入')

    const [itRows] = await conn.query(
      `SELECT id, type_key FROM work_item_types WHERE enabled=1 AND type_key IN ('DEMAND_DEV','BUG_FIX','MEETING')`,
    )
    const itemTypes = Object.fromEntries(itRows.map((r) => [r.type_key, Number(r.id)]))
    if (!itemTypes.DEMAND_DEV || !itemTypes.BUG_FIX || !itemTypes.MEETING) {
      throw new Error('缺少工时类型 DEMAND_DEV/BUG_FIX/MEETING，停止写入')
    }

    const depWegic = await upsertBy(
      conn,
      'departments',
      'name=?',
      ['Wegic业务线'],
      `INSERT INTO departments(name,parent_id,manager_user_id,sort_order,enabled) VALUES(?,?,?,?,1)`,
      ['Wegic业务线', null, users.wegic_member, 10],
      `UPDATE departments SET parent_id=?,manager_user_id=?,sort_order=?,enabled=1,updated_at=NOW() WHERE id=?`,
      [null, users.wegic_member, 10],
    )
    const depA1 = await upsertBy(
      conn,
      'departments',
      'name=?',
      ['A1业务线'],
      `INSERT INTO departments(name,parent_id,manager_user_id,sort_order,enabled) VALUES(?,?,?,?,1)`,
      ['A1业务线', null, users.a1_member, 20],
      `UPDATE departments SET parent_id=?,manager_user_id=?,sort_order=?,enabled=1,updated_at=NOW() WHERE id=?`,
      [null, users.a1_member, 20],
    )
    const depPMO = await upsertBy(
      conn,
      'departments',
      'name=?',
      ['项目管理办公室'],
      `INSERT INTO departments(name,parent_id,manager_user_id,sort_order,enabled) VALUES(?,?,?,?,1)`,
      ['项目管理办公室', null, users.projectmanger, 30],
      `UPDATE departments SET parent_id=?,manager_user_id=?,sort_order=?,enabled=1,updated_at=NOW() WHERE id=?`,
      [null, users.projectmanger, 30],
    )

    await conn.query('UPDATE users SET department_id=? WHERE id=?', [depPMO, users.projectmanger])
    await conn.query('UPDATE users SET department_id=? WHERE id=?', [depWegic, users.wegic_member])
    await conn.query('UPDATE users SET department_id=? WHERE id=?', [depA1, users.a1_member])

    await conn.query(
      `INSERT INTO user_departments(user_id,department_id,is_primary) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE is_primary=VALUES(is_primary)`,
      [users.projectmanger, depPMO, 1],
    )
    await conn.query(
      `INSERT INTO user_departments(user_id,department_id,is_primary) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE is_primary=VALUES(is_primary)`,
      [users.wegic_member, depWegic, 1],
    )
    await conn.query(
      `INSERT INTO user_departments(user_id,department_id,is_primary) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE is_primary=VALUES(is_primary)`,
      [users.a1_member, depA1, 1],
    )

    for (const [uid, displayName, mobile, mode] of [
      [users.projectmanger, '项目管理员', '13800000001', 'datetime'],
      [users.wegic_member, 'Wegic成员', '13800000027', 'date'],
      [users.a1_member, 'A1成员', '13800000028', 'datetime'],
    ]) {
      await conn.query(
        `INSERT INTO user_preferences(user_id,display_name,mobile,default_home,date_display_mode,demand_list_compact_default)
         VALUES(?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           display_name=VALUES(display_name),mobile=VALUES(mobile),default_home=VALUES(default_home),
           date_display_mode=VALUES(date_display_mode),demand_list_compact_default=VALUES(demand_list_compact_default),updated_at=NOW()`,
        [uid, displayName, mobile, '/work-logs', mode, 1],
      )
    }

    const demands = [
      ['REQ901', `${TAG} Wegic 新人引导优化`, users.wegic_member, 'ACQUISITION_GROWTH', day(14), 'IN_PROGRESS', 'P1', 18.0],
      ['REQ902', `${TAG} Wegic 统计筛选增强`, users.wegic_member, 'USER_VALUE', day(9), 'TODO', 'P2', 10.0],
      ['REQ903', `${TAG} Wegic 线上故障复盘`, users.projectmanger, 'STABILITY_GUARANTEE', day(-2), 'DONE', 'P2', 8.0],
      ['REQ904', `${TAG} A1 渠道投放看板`, users.a1_member, 'ACQUISITION_GROWTH', day(12), 'IN_PROGRESS', 'P1', 20.0],
      ['REQ905', `${TAG} A1 订单漏斗分析`, users.a1_member, 'USER_VALUE', day(20), 'TODO', 'P0', 24.0],
      ['REQ906', `${TAG} A1 发布后跟踪`, users.projectmanger, 'PROFESSIONAL_FUNCTION', day(-5), 'DONE', 'P3', 6.0],
    ]
    for (const d of demands) {
      await conn.query(
        `INSERT INTO work_demands(id,name,owner_user_id,business_group_code,expected_release_date,status,priority,owner_estimate_hours,description,created_by)
         VALUES(?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           name=VALUES(name),owner_user_id=VALUES(owner_user_id),business_group_code=VALUES(business_group_code),
           expected_release_date=VALUES(expected_release_date),status=VALUES(status),priority=VALUES(priority),
           owner_estimate_hours=VALUES(owner_estimate_hours),description=VALUES(description),updated_at=NOW()`,
        [d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], `${d[1]} - 假数据`, users.projectmanger],
      )
    }

    const phases = [
      ['REQ901', 'PRODUCT_SOLUTION', '产品方案', users.wegic_member, 4, 'DONE', 10, day(-10), day(-8)],
      ['REQ901', 'DEV', '前端开发', users.wegic_member, 8, 'IN_PROGRESS', 20, day(-7), null],
      ['REQ901', 'TEST', '测试阶段', users.projectmanger, 6, 'TODO', 30, null, null],
      ['REQ904', 'TECH_SOLUTION_BACK', '后端方案', users.a1_member, 6, 'DONE', 10, day(-9), day(-8)],
      ['REQ904', 'DEV_BACK', '后端开发', users.a1_member, 10, 'IN_PROGRESS', 20, day(-7), null],
      ['REQ904', 'TEST', '测试阶段', users.projectmanger, 4, 'TODO', 30, null, null],
    ]
    for (const p of phases) {
      const phaseId = await firstId(conn, `SELECT id FROM work_demand_phases WHERE demand_id=? AND phase_key=? LIMIT 1`, [p[0], p[1]])
      if (phaseId) {
        await conn.query(
          `UPDATE work_demand_phases
           SET phase_name=?,owner_user_id=?,estimate_hours=?,status=?,sort_order=?,started_at=?,completed_at=?,remark=?,updated_at=NOW()
           WHERE id=?`,
          [p[2], p[3], p[4], p[5], p[6], p[7], p[8], `${TAG} 阶段数据`, phaseId],
        )
      } else {
        await conn.query(
          `INSERT INTO work_demand_phases(demand_id,phase_key,phase_name,owner_user_id,estimate_hours,status,sort_order,started_at,completed_at,remark)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], `${TAG} 阶段数据`],
        )
      }
    }

    const logs = [
      [users.wegic_member, day(-1), itemTypes.DEMAND_DEV, `${TAG} REQ901 前端页面联调`, 4, 3.5, 4, 'IN_PROGRESS', 'OWNER_ASSIGN', 'REQ901', 'DEV'],
      [users.a1_member, day(-1), itemTypes.DEMAND_DEV, `${TAG} REQ904 后端接口开发`, 6, 5, 6, 'IN_PROGRESS', 'OWNER_ASSIGN', 'REQ904', 'DEV_BACK'],
      [users.projectmanger, day(-2), itemTypes.BUG_FIX, `${TAG} REQ903 复盘问题关闭`, 2, 2, 2, 'DONE', 'SELF', 'REQ903', 'BUG_FIX_BACK'],
      [users.wegic_member, day(0), itemTypes.MEETING, `${TAG} 项目例会同步`, 1.5, 1, null, 'DONE', 'SELF', 'REQ902', 'PRODUCT_SOLUTION'],
      [users.a1_member, day(0), itemTypes.BUG_FIX, `${TAG} A1 分页总数修复`, 3, 0, 3, 'TODO', 'OWNER_ASSIGN', 'REQ904', 'BUG_FIX_BACK'],
    ]
    const logIdMap = {}
    for (const l of logs) {
      const existed = await firstId(conn, `SELECT id FROM work_logs WHERE description=? LIMIT 1`, [l[3]])
      if (existed) {
        await conn.query(
          `UPDATE work_logs
           SET user_id=?,log_date=?,item_type_id=?,personal_estimate_hours=?,actual_hours=?,owner_estimate_hours=?,
               remaining_hours=?,log_status=?,task_source=?,demand_id=?,phase_key=?,owner_estimated_by=?,owner_estimated_at=?,assigned_by_user_id=?,
               expected_start_date=?,expected_completion_date=?,log_completed_at=?,updated_at=NOW()
           WHERE id=?`,
          [l[0], l[1], l[2], l[4], l[5], l[6], Math.max((l[6] || 0) - (l[5] || 0), 0), l[7], l[8], l[9], l[10], users.projectmanger, `${day(-2)} 10:00:00`, users.projectmanger, day(-2), day(2), l[7] === 'DONE' ? `${day(0)} 12:00:00` : null, existed],
        )
        logIdMap[l[3]] = existed
      } else {
        const [r] = await conn.query(
          `INSERT INTO work_logs(user_id,log_date,item_type_id,description,personal_estimate_hours,actual_hours,owner_estimate_hours,
             owner_estimated_by,owner_estimated_at,remaining_hours,log_status,task_source,demand_id,phase_key,assigned_by_user_id,expected_start_date,expected_completion_date,log_completed_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [l[0], l[1], l[2], l[3], l[4], l[5], l[6], users.projectmanger, `${day(-2)} 10:00:00`, Math.max((l[6] || 0) - (l[5] || 0), 0), l[7], l[8], l[9], l[10], users.projectmanger, day(-2), day(2), l[7] === 'DONE' ? `${day(0)} 12:00:00` : null],
        )
        logIdMap[l[3]] = Number(r.insertId)
      }
    }

    for (const [desc, u, eDate, h, note] of [
      [`${TAG} REQ901 前端页面联调`, users.wegic_member, day(-1), 3.5, '完成筛选区交互与接口联调'],
      [`${TAG} REQ904 后端接口开发`, users.a1_member, day(-1), 5.0, '完成投放明细接口与缓存'],
      [`${TAG} REQ903 复盘问题关闭`, users.projectmanger, day(-2), 2.0, '复盘导出字段修复验证'],
    ]) {
      const lid = logIdMap[desc]
      const rowId = await firstId(conn, `SELECT id FROM work_log_daily_entries WHERE log_id=? AND user_id=? AND entry_date=? LIMIT 1`, [lid, u, eDate])
      if (rowId) {
        await conn.query(`UPDATE work_log_daily_entries SET actual_hours=?,description=?,created_by=? WHERE id=?`, [h, note, u, rowId])
      } else {
        await conn.query(
          `INSERT INTO work_log_daily_entries(log_id,user_id,entry_date,actual_hours,description,created_by) VALUES(?,?,?,?,?,?)`,
          [lid, u, eDate, h, note, u],
        )
      }
    }

    for (const [desc, u, pDate, h, source, note] of [
      [`${TAG} REQ901 前端页面联调`, users.wegic_member, day(1), 3.0, 'MANUAL', '补齐边界条件回归'],
      [`${TAG} REQ904 后端接口开发`, users.a1_member, day(1), 4.0, 'SYSTEM_SPLIT', '完善导出和分页边界'],
      [`${TAG} A1 分页总数修复`, users.a1_member, day(2), 3.0, 'MANUAL', '修复总数统计偏差'],
    ]) {
      const lid = logIdMap[desc]
      const rowId = await firstId(conn, `SELECT id FROM work_log_daily_plans WHERE log_id=? AND user_id=? AND plan_date=? LIMIT 1`, [lid, u, pDate])
      if (rowId) {
        await conn.query(
          `UPDATE work_log_daily_plans SET planned_hours=?,source=?,note=?,created_by=?,updated_at=NOW() WHERE id=?`,
          [h, source, note, users.projectmanger, rowId],
        )
      } else {
        await conn.query(
          `INSERT INTO work_log_daily_plans(log_id,user_id,plan_date,planned_hours,source,note,created_by) VALUES(?,?,?,?,?,?,?)`,
          [lid, u, pDate, h, source, note, users.projectmanger],
        )
      }
    }

    const templateId = await upsertBy(
      conn,
      'wf_process_templates',
      'template_key=?',
      ['DEMAND_SEED_FLOW'],
      `INSERT INTO wf_process_templates(template_key,template_name,biz_type,version,is_default,enabled,created_by) VALUES(?,?,?,?,?,?,?)`,
      ['DEMAND_SEED_FLOW', '需求示例流程', 'DEMAND', 1, 0, 1, users.projectmanger],
      `UPDATE wf_process_templates SET template_name=?,biz_type=?,version=?,is_default=?,enabled=?,created_by=?,updated_at=NOW() WHERE id=?`,
      ['需求示例流程', 'DEMAND', 1, 0, 1, users.projectmanger],
    )

    for (const n of [
      ['REQ_ANALYSIS', '需求分析', 'PRODUCT_SOLUTION', 10],
      ['DEV_IMPL', '开发实现', 'DEV_BACK', 20],
      ['QA_VERIFY', '测试验证', 'TEST', 30],
    ]) {
      const nid = await firstId(conn, `SELECT id FROM wf_process_template_nodes WHERE template_id=? AND node_key=? LIMIT 1`, [templateId, n[0]])
      const payload = [n[1], 'TASK', n[2], n[3], 1, 'MANUAL', JSON.stringify({ seed: true })]
      if (nid) {
        await conn.query(
          `UPDATE wf_process_template_nodes
           SET node_name=?,node_type=?,phase_key=?,sort_order=?,allow_return_to_prev=?,assignee_rule=?,extra_json=?,updated_at=NOW()
           WHERE id=?`,
          [...payload, nid],
        )
      } else {
        await conn.query(
          `INSERT INTO wf_process_template_nodes(template_id,node_key,node_name,node_type,phase_key,sort_order,allow_return_to_prev,assignee_rule,extra_json)
           VALUES(?,?,?,?,?,?,?,?,?)`,
          [templateId, n[0], ...payload],
        )
      }
    }

    for (const [bizId, currentNode, ownerUser] of [['REQ901', 'DEV_IMPL', users.wegic_member], ['REQ904', 'QA_VERIFY', users.a1_member]]) {
      let insId = await firstId(
        conn,
        `SELECT id FROM wf_process_instances WHERE biz_type='DEMAND' AND biz_id=? AND created_by=? ORDER BY id DESC LIMIT 1`,
        [bizId, users.projectmanger],
      )
      if (insId) {
        await conn.query(
          `UPDATE wf_process_instances SET template_id=?,template_version=1,status='IN_PROGRESS',current_node_key=?,started_at=?,ended_at=NULL,updated_at=NOW() WHERE id=?`,
          [templateId, currentNode, `${day(-7)} 09:00:00`, insId],
        )
      } else {
        const [r] = await conn.query(
          `INSERT INTO wf_process_instances(biz_type,biz_id,template_id,template_version,status,current_node_key,started_at,created_by)
           VALUES('DEMAND',?,?,1,'IN_PROGRESS',?,?,?)`,
          [bizId, templateId, currentNode, `${day(-7)} 09:00:00`, users.projectmanger],
        )
        insId = Number(r.insertId)
      }

      const nodeDefs = [
        ['REQ_ANALYSIS', '需求分析', 'PRODUCT_SOLUTION', 10, 'DONE', users.projectmanger],
        ['DEV_IMPL', '开发实现', bizId === 'REQ901' ? 'DEV' : 'DEV_BACK', 20, currentNode === 'DEV_IMPL' ? 'IN_PROGRESS' : 'DONE', ownerUser],
        ['QA_VERIFY', '测试验证', 'TEST', 30, currentNode === 'QA_VERIFY' ? 'IN_PROGRESS' : 'TODO', users.projectmanger],
      ]

      const nodeIdMap = {}
      for (const nd of nodeDefs) {
        const inId = await firstId(conn, `SELECT id FROM wf_process_instance_nodes WHERE instance_id=? AND node_key=? LIMIT 1`, [insId, nd[0]])
        const vals = [nd[1], 'TASK', nd[2], nd[3], nd[4], nd[5], `${day(-6)} 09:00:00`, nd[4] === 'DONE' ? `${day(-2)} 18:00:00` : null, day(3), `${TAG} 节点`]
        if (inId) {
          await conn.query(
            `UPDATE wf_process_instance_nodes
             SET node_name_snapshot=?,node_type=?,phase_key=?,sort_order=?,status=?,assignee_user_id=?,started_at=?,completed_at=?,due_at=?,remark=?,updated_at=NOW()
             WHERE id=?`,
            [...vals, inId],
          )
          nodeIdMap[nd[0]] = inId
        } else {
          const [r] = await conn.query(
            `INSERT INTO wf_process_instance_nodes(instance_id,node_key,node_name_snapshot,node_type,phase_key,sort_order,status,assignee_user_id,started_at,completed_at,due_at,remark)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            [insId, nd[0], ...vals],
          )
          nodeIdMap[nd[0]] = Number(r.insertId)
        }
      }

      for (const t of [
        [`${TAG} ${bizId} 开发任务`, nodeIdMap.DEV_IMPL, ownerUser, currentNode === 'DEV_IMPL' ? 'IN_PROGRESS' : 'DONE', 'HIGH'],
        [`${TAG} ${bizId} 测试任务`, nodeIdMap.QA_VERIFY, users.projectmanger, currentNode === 'QA_VERIFY' ? 'IN_PROGRESS' : 'TODO', 'NORMAL'],
      ]) {
        const tid = await firstId(
          conn,
          `SELECT id FROM wf_process_tasks WHERE instance_node_id=? AND assignee_user_id=? AND task_title=? LIMIT 1`,
          [t[1], t[2], t[0]],
        )
        if (tid) {
          await conn.query(
            `UPDATE wf_process_tasks
             SET instance_id=?,status=?,priority=?,due_at=?,source_type='DEMAND',source_id=?,created_by=?,completed_at=?,updated_at=NOW()
             WHERE id=?`,
            [insId, t[3], t[4], day(3), Number(String(bizId).replace('REQ', '')), users.projectmanger, t[3] === 'DONE' ? `${day(-1)} 12:00:00` : null, tid],
          )
        } else {
          await conn.query(
            `INSERT INTO wf_process_tasks(instance_id,instance_node_id,task_title,assignee_user_id,status,priority,due_at,source_type,source_id,created_by,completed_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            [insId, t[1], t[0], t[2], t[3], t[4], day(3), 'DEMAND', Number(String(bizId).replace('REQ', '')), users.projectmanger, t[3] === 'DONE' ? `${day(-1)} 12:00:00` : null],
          )
        }
      }

      for (const a of [
        ['PROCESS_INIT', null, 'REQ_ANALYSIS', '流程初始化'],
        ['NODE_COMPLETE', 'REQ_ANALYSIS', 'DEV_IMPL', '进入开发阶段'],
      ]) {
        const aid = await firstId(
          conn,
          `SELECT id FROM wf_process_actions WHERE instance_id=? AND action_type=? AND COALESCE(from_node_key,'')=COALESCE(?, '') AND COALESCE(to_node_key,'')=COALESCE(?, '') LIMIT 1`,
          [insId, a[0], a[1], a[2]],
        )
        if (aid) {
          await conn.query(
            `UPDATE wf_process_actions
             SET operator_user_id=?,target_user_id=?,comment=?,source_type='DEMAND',source_id=? WHERE id=?`,
            [users.projectmanger, ownerUser, `${TAG} ${a[3]}`, Number(String(bizId).replace('REQ', '')), aid],
          )
        } else {
          await conn.query(
            `INSERT INTO wf_process_actions(instance_id,instance_node_id,action_type,from_node_key,to_node_key,operator_user_id,target_user_id,comment,source_type,source_id)
             VALUES(?,?,?,?,?,?,?,?,?,?)`,
            [insId, null, a[0], a[1], a[2], users.projectmanger, ownerUser, `${TAG} ${a[3]}`, 'DEMAND', Number(String(bizId).replace('REQ', ''))],
          )
        }
      }
    }

    await conn.query(
      `INSERT INTO menu_visibility_rules(menu_key,scope_type,department_id,department_ids_json,role_keys_json)
       VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE scope_type=VALUES(scope_type),department_id=VALUES(department_id),
       department_ids_json=VALUES(department_ids_json),role_keys_json=VALUES(role_keys_json),updated_at=NOW()`,
      ['project-management', 'ROLE', null, null, JSON.stringify(['SUPER_ADMIN', 'ADMIN'])],
    )
    await conn.query(
      `INSERT INTO menu_visibility_rules(menu_key,scope_type,department_id,department_ids_json,role_keys_json)
       VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE scope_type=VALUES(scope_type),department_id=VALUES(department_id),
       department_ids_json=VALUES(department_ids_json),role_keys_json=VALUES(role_keys_json),updated_at=NOW()`,
      ['work-logs', 'ALL', null, null, null],
    )

    await conn.commit()

    const tables = [
      'departments',
      'user_departments',
      'user_preferences',
      'work_demands',
      'work_demand_phases',
      'work_logs',
      'work_log_daily_entries',
      'work_log_daily_plans',
      'wf_process_templates',
      'wf_process_template_nodes',
      'wf_process_instances',
      'wf_process_instance_nodes',
      'wf_process_tasks',
      'wf_process_actions',
      'menu_visibility_rules',
    ]
    console.log('[seed] done, current counts:')
    for (const t of tables) {
      const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM ${t}`)
      console.log(`- ${t}: ${rows[0].c}`)
    }
  } catch (err) {
    await conn.rollback()
    console.error('[seed] rolled back')
    throw err
  } finally {
    conn.release()
  }
}

run()
  .then(async () => {
    await pool.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    try {
      await pool.end()
    } catch (closeErr) {
      console.error(closeErr.message)
    }
    process.exit(1)
  })
