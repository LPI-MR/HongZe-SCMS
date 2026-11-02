// Seed 演示/基础数据模板
//
// 使用规则(按《分布式开发数据库协作方案》):
//   - 仅在以下情况执行:新成员首次搭环境 / 想重置为统一演示数据 / Seed 内容更新后同步
//   - 执行命令: npx prisma db seed
//   - Seed 必须与当前 schema.prisma 保持一致;改了结构请同步修改本文件
//   - 个人临时测试数据不要写进这里
//
// 本文件使用 upsert(按唯一键存在则更新、不存在则创建),可重复执行不报错。

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ---- 用户(密码仅为演示,正式环境必须换哈希) ----
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: 'admin123', name: '管理员', role: 'admin' },
  });
  await prisma.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: { username: 'demo', password: 'demo123', name: '演示账号', role: 'staff' },
  });

  // ---- 客户 ----
  const customers = [
    { name: '弘泽钢铁贸易有限公司', contact: '王经理', phone: '13800000001', region: '天津' },
    { name: '北方矿业集团', contact: '李总', phone: '13800000002', region: '河北' },
    { name: '临港物流有限公司', contact: '赵主管', phone: '13800000003', region: '山东' },
  ];
  for (const c of customers) {
    await prisma.customer.upsert({ where: { name: c.name }, update: {}, create: c });
  }

  // ---- 商品 ----
  const commodities = [
    { code: 'IRON_ORE', name: '铁矿石', unit: '吨', note: 'PB粉、超特粉等' },
    { code: 'COAL', name: '煤炭', unit: '吨', note: '动力煤、焦煤' },
    { code: 'STEEL_BILLET', name: '钢坯', unit: '吨' },
    { code: 'GRAIN', name: '粮食', unit: '吨' },
  ];
  for (const c of commodities) {
    await prisma.commodity.upsert({ where: { code: c.code }, update: {}, create: c });
  }

  console.log('Seed 完成: 用户 x2, 客户 x3, 商品 x4');
}

main()
  .catch((e) => {
    console.error('Seed 执行失败(请检查 schema 与本文件是否一致):', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
