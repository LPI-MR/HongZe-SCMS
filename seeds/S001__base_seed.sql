-- ============================================================================
-- HongZe-SCMS 种子 S001 · 基础主数据
-- 来源: 系统内置演示数据（localStorage 种子常量，经 scripts/dump-seeds.js 提取）
-- 幂等: 可重复执行（主表 ON CONFLICT DO UPDATE，从表 DELETE+INSERT）
-- 依赖: V001__init_schema.sql 与 V002__seed_registry.sql 已应用
-- 事务: 由 scripts/seed.js 执行器统一包裹 BEGIN/COMMIT，本文件不自带
-- ============================================================================
-- ---- 1. meta.dict_entry（80 条，17 个域）----
INSERT INTO meta.dict_entry (scope, code, label, sort_no, payload, parent_code) VALUES
('discharge_ports', '青岛港', '青岛港', 0, $j${"country":"中国"}$j$::jsonb, NULL),
('discharge_ports', '曹妃甸港', '曹妃甸港', 1, $j${"country":"中国"}$j$::jsonb, NULL),
('discharge_ports', '日照港', '日照港', 2, $j${"country":"中国"}$j$::jsonb, NULL),
('discharge_ports', '舟山港', '舟山港', 3, $j${"country":"中国"}$j$::jsonb, NULL),
('discharge_ports', '大连港', '大连港', 4, $j${"country":"中国"}$j$::jsonb, NULL),
('discharge_ports', '天津港', '天津港', 5, $j${"country":"中国"}$j$::jsonb, NULL),
('discharge_ports', '湛江港', '湛江港', 6, $j${"country":"中国"}$j$::jsonb, NULL),
('discharge_ports', '上海港', '上海港', 7, $j${"country":"中国"}$j$::jsonb, NULL),
('discharge_ports', '连云港', '连云港', 8, $j${"country":"中国"}$j$::jsonb, NULL),
('mine_load_ports', '力拓→丹皮尔港', '丹皮尔港', 0, $j${"mine":"力拓","port":"丹皮尔港","country":"澳大利亚","note":"西澳矿区 → 丹皮尔港，铁路短倒约 300km"}$j$::jsonb, NULL),
('mine_load_ports', '必和必拓→黑德兰港', '黑德兰港', 1, $j${"mine":"必和必拓","port":"黑德兰港","country":"澳大利亚","note":"纽曼矿区 → 黑德兰港，铁路短倒约 400km"}$j$::jsonb, NULL),
('mine_load_ports', '福斯特库→黑德兰港', '黑德兰港', 2, $j${"mine":"福斯特库","port":"黑德兰港","country":"澳大利亚","note":"奇切斯特岭矿区 → 黑德兰港，铁路短倒约 250km"}$j$::jsonb, NULL),
('mine_load_ports', '淡水河谷→图巴朗港', '图巴朗港', 3, $j${"mine":"淡水河谷","port":"图巴朗港","country":"巴西","note":"卡拉加斯矿区 → 图巴朗港，铁路短倒约 900km"}$j$::jsonb, NULL),
('order_status', '待确认', '待确认', 0, NULL, NULL),
('order_status', '已确认', '已确认', 1, NULL, NULL),
('order_status', '执行中', '执行中', 2, NULL, NULL),
('order_status', '已发运', '已发运', 3, NULL, NULL),
('order_status', '已完成', '已完成', 4, NULL, NULL),
('order_status', '已终止', '已终止', 5, NULL, NULL),
('settle_type', '应收', '应收', 0, NULL, NULL),
('settle_type', '应付', '应付', 1, NULL, NULL),
('voyage_status', 'pending', '待装船', 0, NULL, NULL),
('voyage_status', 'loading', '装船中', 1, NULL, NULL),
('voyage_status', 'sailing', '在途', 2, NULL, NULL),
('voyage_status', 'arrived', '已到港', 3, NULL, NULL),
('voyage_status', 'done', '已完成', 4, NULL, NULL),
('spot_meta', 'default', '港口现货元信息', 0, $j${"source":"中国矿产·中矿国链港口现货","dataDate":"2026-05-25"}$j$::jsonb, NULL),
('seed_wharf', '综合码头', '综合码头', 0, NULL, NULL),
('seed_wharf', '矿石码头', '矿石码头', 1, NULL, NULL),
('seed_wharf', '煤炭码头', '煤炭码头', 2, NULL, NULL),
('seed_wharf', '散货码头', '散货码头', 3, NULL, NULL),
('seed_wharf', '集装箱码头', '集装箱码头', 4, NULL, NULL),
('seed_port', '黄骅港', '黄骅港', 0, NULL, NULL),
('seed_mine_map', '力拓', '力拓', 0, $j${"categories":["PB粉","杨迪粉","罗布河粉"]}$j$::jsonb, NULL),
('seed_mine_map', 'BHP 必和必拓', 'BHP 必和必拓', 1, $j${"categories":["纽曼粉","麦克粉","金布巴粉"]}$j$::jsonb, NULL),
('seed_mine_map', '淡水河谷', '淡水河谷', 2, $j${"categories":["卡粉","巴混"]}$j$::jsonb, NULL),
('seed_mine_map', 'FMG', 'FMG', 3, $j${"categories":["超特粉","混合粉"]}$j$::jsonb, NULL),
('seed_dest_station', '武安站', '武安站', 0, $j${"yards":[{"yard":"河北陆港保税物流中心（保税堆场）","steels":["天铁集团","普阳钢铁","冀南钢铁"]},{"yard":"河北南洋移山物流有限公司","steels":["新兴铸管","新金钢铁"]}]}$j$::jsonb, NULL),
('seed_dest_station', '康城站', '康城站', 1, $j${"yards":[{"yard":"武安保税物流园","steels":["邯郸钢铁集团","邯钢新区"]}]}$j$::jsonb, NULL),
('seed_dest_station', '曹庄镇站', '曹庄镇站', 2, $j${"yards":[{"yard":"曹庄镇站物流园","steels":["河北普阳","邯郸华信"]}]}$j$::jsonb, NULL),
('vessel_type', '散堆船', '散堆船', 0, NULL, NULL),
('vessel_type', '集装箱船', '集装箱船', 1, NULL, NULL),
('wh_ores', 'PB粉', 'PB粉', 0, NULL, NULL),
('wh_ores', 'PB块', 'PB块', 1, NULL, NULL),
('wh_ores', '纽曼粉', '纽曼粉', 2, NULL, NULL),
('wh_ores', '纽曼块', '纽曼块', 3, NULL, NULL),
('wh_ores', '麦克粉', '麦克粉', 4, NULL, NULL),
('wh_ores', '巴西混合粉', '巴西混合粉', 5, NULL, NULL),
('wh_ores', 'FMG混合粉', 'FMG混合粉', 6, NULL, NULL),
('wh_ores', '罗布河混合粉', '罗布河混合粉', 7, NULL, NULL),
('wh_ores', '超特粉', '超特粉', 8, NULL, NULL),
('wh_ores', '金布巴粉', '金布巴粉', 9, NULL, NULL),
('wh_ores', '混合粉', '混合粉', 10, NULL, NULL),
('wh_ores', '磁铁精粉', '磁铁精粉', 11, NULL, NULL),
('wh_ores', '罗布河粉', '罗布河粉', 12, NULL, NULL),
('wh_ores', '扬迪粉', '扬迪粉', 13, NULL, NULL),
('rail_stations', '黄骅港站', '黄骅港站', 0, NULL, NULL),
('rail_stations', '武安', '武安', 1, NULL, NULL),
('rail_stations', '天津港站', '天津港站', 3, NULL, NULL),
('rail_stations', '曹妃甸港站', '曹妃甸港站', 4, NULL, NULL),
('rail_stations', '邢台南站', '邢台南站', 6, NULL, NULL),
('rail_stations', '曹庄镇站', '曹庄镇站', 7, NULL, NULL),
('rail_stations', '康城站', '康城站', 8, NULL, NULL),
('rail_stations', '涉县', '涉县', 9, NULL, NULL),
('rail_goods', '铁矿石', '铁矿石', 0, NULL, NULL),
('rail_goods', '钢坯', '钢坯', 1, NULL, NULL),
('rail_goods', '焦炭', '焦炭', 2, NULL, NULL),
('truck_places', '黄骅港', '黄骅港', 0, NULL, NULL),
('truck_places', '武安', '武安', 1, NULL, NULL),
('truck_places', '曹妃甸港', '曹妃甸港', 2, NULL, NULL),
('truck_places', '天津港', '天津港', 3, NULL, NULL),
('truck_places', '日照港', '日照港', 5, NULL, NULL),
('truck_places', '董家口港', '董家口港', 6, NULL, NULL),
('truck_places', '岚山港', '岚山港', 7, NULL, NULL),
('truck_places', '岚桥港', '岚桥港', 8, NULL, NULL),
('truck_places', '前港', '前港', 9, NULL, NULL),
('truck_places', '涉县', '涉县', 11, NULL, NULL),
('truck_goods', '铁矿石', '铁矿石', 0, NULL, NULL),
('truck_goods', '钢铁', '钢铁', 1, NULL, NULL),
('sys', 'trip_seq', '调度车次序号', 0, $j${"value":13}$j$::jsonb, NULL)
ON CONFLICT (scope, code) DO UPDATE SET
  label = EXCLUDED.label, sort_no = EXCLUDED.sort_no,
  payload = EXCLUDED.payload, parent_code = EXCLUDED.parent_code;

-- ---- 2. mine.mine_info（5 家矿山）----
INSERT INTO mine.mine_info
  (id, mine_name, short_name, mine_type, main_products, province, city, district, address,
   longitude, latitude, annual_capacity, reserve, ore_grade, operator, contact_person, contact_phone,
   status, commissioned_year, remark, intro, tagline, img_url, hero_url, gallery_urls,
   img_prompt, hero_prompt, img_credit, story, created_at, updated_at)
VALUES
  ('mmwemahb9', '力拓', '力拓', 'iron', 'PB粉,PB块,杨迪粉,罗布河粉,SP10',
   '西澳大利亚州', '皮尔巴拉地区', NULL, 'Pilbara, Western Australia',
   117.85, -22.66, 35000, 2600000, 'TFe 61%-63%', 'Rio Tinto（力拓集团）',
   NULL, NULL, 'active', 1966,
   '即哈默斯利铁矿（皮尔巴拉）。全球主要铁矿供应商之一，装货港以丹皮尔港为主', '力拓集团的业务遍及全球六大洲的34个国家，我们的61,000余名员工正努力寻求以更好的方式，提供世界所需材料。', '寻求以更好的方式，提供世界所需材料', '/mine/assets/rt-list.jpg', '/mine/assets/rt-hero.jpg', $j$["/mine/assets/rt-g1.jpg","/mine/assets/rt-g2.jpg"]$j$::jsonb,
   'aerial view of Pilbara open-pit iron ore mine, Western Australia, red ochre terraced benches, giant haul trucks, deep blue sky, realistic photography', 'dramatic high altitude satellite view of Pilbara iron ore mining region, Western Australia, vast red ochre earth with winding haul roads and terraced open pits, realistic satellite photography', '图片来源：Wikimedia Commons（Brockman 4 / Mount Tom Price）', $j$[{"h":"关于力拓","p":"力拓集团的业务遍及全球六大洲的34个国家，我们的61,000余名员工正努力寻求以更好的方式，提供世界所需材料。\n\n我们的核心产品——铁矿石、铜、铝和锂——是构建更清洁、更智能未来的基石。\n\n为了满足日益增长的需求，我们致力于在保障员工安全的同时，运营并交付世界一流的业务和项目。\n\n我们承诺以负责任的方式开展业务——凭借深厚的专业知识、强劲的社会许可以及长期的合作伙伴关系，创造持久的积极影响。\n\n我们携手应对全球挑战，共创共享成功。"},{"h":"我们的使命","p":"成为最具价值的金属矿业公司"},{"h":"我们的愿景","p":"寻求以更好的方式，提供世界所需材料"},{"h":"我们的战略","p":"以强劲的资产负债表和社会许可为支撑，在优质市场构建由世界级资产和项目组成的多元化投资组合"},{"h":"我们的目标","p":"我们的目标是一切行动的指引，也是我们成为最具价值的金属矿业公司的基石。\n\n以人为本、安全至上：在基于价值的绩效文化中，杜绝死亡事故，保障员工安全，并助力其实现个人成长。\n\n卓越运营：充分释放资产的全部价值，精简业务并明确责任归属，同时保持财务纪律。\n\n卓越发展：优化资本配置，将增长机遇转化为长期价值。\n\n强劲的可持续发展与社会许可：推动碳减排进程，成为最具价值的合作伙伴，为商业表现设立防护机制以保障未来声誉，并赢得社区、合作伙伴及客户的信任。"},{"h":"我们的价值观","p":"关爱：我们关注自身和身边人的安全，营造互信的环境，并重视我们对同事、社区和环境的影响。\n\n勇敢：我们勇于承认不足，敢于发声并挑战现状，并为自己的行动和结果负责，以此推动业绩提升。\n\n探索：我们满怀求知欲，在专业领域不断学习和成长，寻找通过日常创新解决问题的机会，并以开放包容的心态拥抱多元化观点。"}]$j$::jsonb,
   to_timestamp(1794120611877 / 1000.0), to_timestamp(1794120611877 / 1000.0)),
  ('mmwemahba', '必和必拓', '必和必拓', 'iron', '纽曼粉,麦克粉,块矿',
   '西澳大利亚州', '纽曼镇', NULL, 'Mount Newman, Pilbara, Western Australia',
   119.75, -23.36, 29000, 2100000, 'TFe 61%-62%', 'BHP（必和必拓）',
   NULL, NULL, 'active', 1969,
   '即纽曼山铁矿（皮尔巴拉）。装货港以黑德兰港为主', '必和必拓是一家业务覆盖多个国家和地区的国际化资源公司，业务遍布全球90多个地点，产品销往世界各地。', '融汇英才资源，共创美好未来', '/mine/assets/bhp-list.jpg', '/mine/assets/bhp-hero.jpg', $j$["/mine/assets/bhp-g1.jpg","/mine/assets/bhp-g2.jpg"]$j$::jsonb,
   'Mount Newman iron ore mine in Pilbara outback Australia, mining plant and long ore trains, golden sunlight, vast red desert, realistic photography', 'high altitude satellite view of Mount Newman iron ore mining complex in Pilbara outback, red desert terrain with open pits and railway lines radiating, realistic satellite photography', '图片来源：NASA Earth Observatory / Wikimedia Commons（Mount Whaleback）', $j$[{"h":"必和必拓概况","p":"必和必拓是一家业务覆盖多个国家和地区的国际化资源公司，业务遍布全球90多个地点，产品销往世界各地。\n\n我们将业务定位于支持塑造世界的宏观趋势。通过铁矿石和冶金煤支撑全球基建及能源转型所需的钢材生产；开发铜矿助力可再生能源发展；并正拓展钾肥业务以支持可持续农业发展。\n\n我们的资源组合既立足当下，又着眼未来。"},{"h":"我们的业务","p":"我们是一家国际化资源公司，业务涵盖铁矿石、铜和炼钢煤，并正拓展钾肥业务。依托多元化的资源资产组合，我们致力于持续为客户、合作伙伴和所在社区创造长期价值。"},{"h":"我们的战略","p":"我们将负责任地管理最具韧性的长期资产组合，专注于极具吸引力的大宗商品，并通过卓越运营、资源勘探与开发、优质资产收购和高效资本配置，实现价值增长。\n\n同时，我们以独特方式创造社会价值，为所有利益相关方带来收益，成为值得信赖的合作伙伴。"},{"h":"铁矿石","p":"西澳铁矿（WAIO）是全球生产成本最低的主要大型铁矿石生产商。"},{"h":"铜","p":"我们拥有多元化的铜矿资源组合，其中包括位于智利的全球重要的在产铜矿之一埃斯康迪达（Escondida）铜矿。"},{"h":"钾肥","p":"我们正在开发全球最大的钾盐矿场之一。詹森项目（Jansen）一期预计于2026年底投产，后续将进入两年产能爬坡期。"},{"h":"我们的价值观","p":"做正确的事：可持续的未来始于安全和诚信，通过构建与利益相关方的信任实现。\n\n寻求更佳途径：倾听学习、鼓励挑战，是我们推动进步的方式。\n\n做出积极改变：每日践行行动责任、创造价值并产生积极影响，是每位成员的责任担当。"}]$j$::jsonb,
   to_timestamp(1794207011877 / 1000.0), to_timestamp(1794207011877 / 1000.0)),
  ('mmwemahbb', '淡水河谷', '淡水河谷', 'iron', '卡拉加斯粉,卡拉加斯块,BRBF,球团矿',
   '帕拉州', '卡拉加斯矿区', NULL, 'Carajás, Pará, Brazil',
   -50.03, -6.07, 20000, 7200000, 'TFe 65%-67%', 'Vale（淡水河谷）',
   NULL, NULL, 'active', 1985,
   '即卡拉加斯铁矿。全球品位最高的铁矿之一，装货港以图巴朗港为主', '淡水河谷成立于1942年，总部位于巴西，是一家以齐心协力改善生活、改变未来为己任的全球性矿业公司。', '齐心协力改善生活、改变未来', '/mine/assets/vale-list.jpg', '/mine/assets/vale-hero.jpg', $j$["/mine/assets/vale-g1.jpg","/mine/assets/vale-g2.jpg"]$j$::jsonb,
   'Carajas iron ore mine, Amazon highlands Brazil, red plateau terraces surrounded by green rainforest, aerial view, realistic photography', 'aerial satellite view of Carajas iron ore mine in Amazon highlands Brazil, red mining terraces surrounded by dense green rainforest, realistic satellite photography', '图片来源：NASA Earth Observatory / Wikimedia Commons（Carajás / Serra Sul）', $j$[{"h":"关于淡水河谷","p":"淡水河谷成立于1942年，总部位于巴西，是一家以齐心协力改善生活、改变未来为己任的全球性矿业公司。淡水河谷是全球领先的铁矿石、铜和镍的生产商之一，公司还生产铁矿石球团和压块、铂族金属、金、银和钴，并运营着与采矿作业无缝衔接的物流系统，包括铁路、海运码头和港口。淡水河谷立志成为备受社会认可的安全标杆、世界一流的可靠矿业运营商、人才驱动型组织、可持续开采的领导者以及创造并分享价值的典范。"},{"h":"淡水河谷与中国","p":"淡水河谷是中国值得信赖的长期合作伙伴，自1973年向中国交付第一船铁矿石起，公司已向中国累计供应了逾30亿吨优质铁矿石，以及铜、镍等优质基本金属。淡水河谷将继续致力于向中国持续供应各种优质矿产品和创新低碳解决方案，支持中国钢铁行业加快发展新质生产力，实现绿色转型，努力为人与自然和谐共生的中国式现代化贡献更多力量。"},{"h":"Our purpose","p":"We exist to improve life and transform the future. Together.\n\n【中文对照】我们的存在，是为了改善生活、改变未来。携手同行。"},{"h":"The history of Vale","p":"Vale was founded on June 1, 1942, in Itabira, Minas Gerais, under the name Companhia Vale do Rio Doce. Over more than eight decades, we have evolved, simplified our name to Vale, and built a journey marked by transformation.\n\nAlong the way, we became a global mining company with operations in 18 countries. At every stage, we have faced challenges and continuously learned from them.\n\nWe have come a long way since the first ore was extracted in Itabira. Since then, we have expanded our operations into integrated logistics, encompassing mines, railways, vessels, and ports, while also strengthening our presence in the energy sector.\n\nToday, we are one of the world's largest mining companies and the global leader in iron ore production.\n\n【中文对照】1942年6月1日，淡水河谷在米纳斯吉拉斯州伊塔比拉成立，最初名为\"多西河谷公司\"。八十余年来，我们不断演进，将名称简化为 Vale，走过了一条以变革为印记的旅程。\n\n在这一过程中，我们成长为一家业务遍及18个国家的全球化矿业公司。在每个阶段，我们都直面挑战，并不断从中学习。\n\n自伊塔比拉采出第一块矿石以来，我们已经走了很远。此后，我们将业务拓展至涵盖矿山、铁路、船舶和港口的一体化物流体系，同时不断加强在能源领域的布局。\n\n今天，我们已成为全球最大的矿业公司之一，也是全球铁矿石产量的领导者。"}]$j$::jsonb,
   to_timestamp(1794293411877 / 1000.0), to_timestamp(1794293411877 / 1000.0)),
  ('mmwemahbc', '福斯特库', '福斯特库', 'iron', '超特粉,混合粉,西皮粉,Iron Bridge精矿',
   '西澳大利亚州', '黑德兰港', NULL, 'Solomon Hub, Chichester Ranges, Western Australia',
   118, -22.3, 19000, 1600000, 'TFe 56%-59%', 'Fortescue（福斯特库）',
   NULL, NULL, 'active', 2013,
   '即所罗门铁矿（奇切斯特岭）。装货港以黑德兰港为主', 'Fortescue is a global metals, energy and technology business providing green solutions to the world.（中文对照：福斯特库是一家面向全球提供绿色解决方案的金属、能源与技术企业。）', 'We''re not waiting for the future.（我们不等待未来）', '/mine/assets/fmg-list.jpg', '/mine/assets/fmg-hero.jpg', $j$["/mine/assets/fmg-g1.jpg"]$j$::jsonb,
   'Solomon Hub iron ore mine, Chichester Ranges Western Australia, open pit terraces, mining machinery at dusk, realistic photography', 'aerial satellite view of Solomon Hub iron ore mine in Chichester Ranges Western Australia, red ochre pit terraces in arid mountain ranges, realistic satellite photography', '图片来源：Wikimedia Commons（Cloudbreak / FMG 铁矿列车）', $j$[{"h":"Who we are","p":"Fortescue is a global metals, energy and technology business providing green solutions to the world.\n\nWe're combining operational scale with innovation to build the systems, tech and infrastructure needed to accelerating the decarbonisation of heavy industry, rapidly, profitably and at global scale.\n\n【中文对照】福斯特库是一家面向全球提供绿色解决方案的金属、能源与技术企业。\n\n我们将运营规模与创新相结合，构建重工业脱碳所需的系统、技术与基础设施——以快速、盈利且覆盖全球规模的方式推进。"},{"h":"What we do","p":"We operate at industrial scale while building the systems needed to move beyond fossil fuels. From mining and infrastructure to zero-emissions systems and technology, we're redefining heavy industry.\n\n【中文对照】我们在工业规模上运营，同时构建超越化石燃料所需的系统。从采矿和基础设施到零排放系统与技术，我们正在重新定义重工业。"},{"h":"Metals","p":"A leading global iron ore producer, building on our Pilbara foundations to create the pathway to green iron and green steel.\n\n【中文对照】作为全球领先的铁矿石生产商，我们依托皮尔巴拉的业务根基，开辟通往绿色铁矿与绿色钢铁的道路。"},{"h":"Fortescue in Figures","p":"For more than 20 years, we've pushed boundaries and built technologies others thought impossible. Today, we're applying that capability to eliminate emissions, reshape heavy industry and unlock what comes next.\n\nA$27.2 billion — Total global economic contribution (FY26)\n\n2.5 billion tonnes — Iron ore shipped since 2008\n\nReal Zero by 2030 — Emissions target (scope 1&2 terrestrial)\n\n【中文对照】二十多年来，我们不断突破边界，打造出别人认为不可能的技术。今天，我们正把这种能力用于消除排放、重塑重工业并开启下一个时代。\n\n272 亿澳元 —— 全球经济贡献总额（2026 财年）\n\n25 亿吨 —— 自 2008 年以来发运的铁矿石\n\n2030 年 Real Zero（真正的零排放）—— 排放目标（范围 1&2 陆地排放）"}]$j$::jsonb,
   to_timestamp(1794379811877 / 1000.0), to_timestamp(1794379811877 / 1000.0)),
  ('mmwemahbd', '西芒杜', '西芒杜', 'iron', '西芒杜高品位粉,块矿',
   '几内亚', '恩泽雷科雷大区', NULL, 'Simandou, Nzérékoré Region, Guinea',
   -9, 8.5, 6000, 2400000, 'TFe 65%-67%', 'Rio Tinto（力拓集团）SimFer联合体',
   NULL, NULL, 'active', 2025,
   '即西芒杜铁矿（Simandou）。全球最大未开发高品位铁矿之一，装货港为几内亚莫雷巴亚港（Morebaya）', 'Africa''s largest mining and related infrastructure project（中文对照：非洲最大的矿业及相关基础设施项目）', 'Africa''s largest mining and related infrastructure project（非洲最大的矿业及相关基础设施项目）', '/mine/assets/sim-list.jpg', '/mine/assets/sim-hero.png', $j$["/mine/assets/sim-list.jpg"]$j$::jsonb,
   'Simandou iron ore project, Guinea West Africa, green mountain range with early mining infrastructure, clear sky, realistic photography', 'aerial satellite view of Simandou mountain range in Guinea West Africa, lush green ridges with early mining infrastructure and red earth roads, realistic satellite photography', '图片来源：Wikimedia Commons（Simandou 项目 / 几内亚高地地形图）', $j$[{"h":"Africa's largest mining and related infrastructure project","p":"The Simandou mountain range lies in the south-east of the Republic of Guinea. The area has subsoils which contain a world class Ore Reserve of high-grade iron ore. Developing a project of Simandou's scale is a unique opportunity.\n\nSimandou is divided into 4 blocks. We hold rights to blocks 3 and 4 through Rio Tinto SimFer – a joint venture with the Government of Guinea and Chalco Iron Ore Holdings (CIOH). These blocks contain ore reserves estimated at around 1.5 billion tonnes. Rio Tinto is the majority shareholder and managing partner of Rio Tinto SimFer.\n\nWe are also working with the Government of Guinea and Winning Consortium Simandou (WCS), developers of Simandou blocks 1 and 2, to co-develop the infrastructure needed to export mined iron ore from the far south-east of the country to Guinea's maritime borders and beyond.\n\nThese include 600km of rail infrastructure – spanning the length of the country – as well as port infrastructure on the coast of the Forécariah prefecture in Guinea.\n\n【中文对照】西芒杜山脉位于几内亚共和国东南部。该地区的地下蕴藏着世界级的高品位铁矿石储量。开发西芒杜这样规模的项目，是一个独一无二的机遇。\n\n西芒杜分为4个区块。我们通过力拓 SimFer（与几内亚政府及中国铝业铁矿控股公司 CIOH 的合资企业）持有第3、4区块的开采权。这些区块的矿石储量估计约15亿吨。力拓是力拓 SimFer 的控股股东和管理合伙方。\n\n我们还与几内亚政府以及西芒杜第1、2区块的开发商赢联盟（WCS）合作，共同开发所需的基础设施，以便将开采的铁矿石从该国最东南部出口至几内亚的海域边界及更远的市场。\n\n这包括600公里的铁路基础设施——纵贯该国全境——以及位于几内亚弗雷卡里亚省沿海的港口基础设施。"},{"h":"Iron ore","p":"Iron ore is the primary raw material used to make steel. Steel is strong, long-lasting and cost-efficient – making it perfect for everything from cars and fridges to wind turbines and skyscrapers.\n\nThe premium grade of Simandou iron ore broadens our global portfolio of iron ore products, complementing our existing, long-term iron ore production in Australia's Pilbara region and in Canada.\n\n【中文对照】铁矿石是制造钢铁的主要原材料。钢铁坚固、耐用且具有成本效益——从汽车、冰箱到风力发电机和摩天大楼，它无处不在。\n\n西芒杜优质品位的铁矿石拓展了我们全球铁矿石产品组合，与我们位于澳大利亚皮尔巴拉地区和加拿大的既有长期铁矿石生产形成互补。"},{"h":"Next steps","p":"Work on the mines and infrastructure is well underway and in December 2025, the first shipment from Simandou left Guinea. Ore is being railed from the SimFer mine to the main rail line via the SimFer rail spur and initially shipped through the WCS port while construction of the SimFer port is finalised.\n\nOnce commissioning of the common rail to port infrastructure is complete, we expect a 30 month ramp up to full capacity of 60 Mtpa production at the SimFer mine.\n\n【中文对照】矿山和基础设施的建设正在全面推进，2025年12月，西芒杜的首批货物已运离几内亚。目前，矿石经 SimFer 铁路支线从 SimFer 矿区运往主线，并在 SimFer 港口建设收尾期间暂经 WCS 港口装船发运。\n\n一旦铁路至港口共享基础设施的调试完成，我们预计将用30个月逐步爬坡，使 SimFer 矿区达到6000万吨/年的满产产能。"},{"h":"Our commitment for Simandou","p":"Simandou is a complex, uniquely transformative project. From the associated infrastructure corridor to the thousands of jobs the project will create, the project will positively impact the Guinean economy, creating opportunities and development potential which will benefit the people of Guinea for generations to come.\n\nAs with any significant development project, challenges will need to be carefully managed, including minimising adverse social, health, safety and environmental impacts while simultaneously fostering positive and tangible change for local communities and other key stakeholders.\n\nThroughout the history of our involvement in the Simandou project, we have maintained regular community consultation designed to maintain dialogue with local communities by addressing questions, concerns and additional opportunities to provide support.\n\nWe are committed to developing the Simandou project in line with internationally recognised environmental, social and governance standards. This includes transparently reporting on impacts of our mining operations, and continuing to work alongside local stakeholders on ways of mitigating these impacts. We recognise the responsibility we are entrusted with and see ourselves as long-term stewards of natural resources. We will continue to work alongside communities to ensure the Simandou project is developed with environmental stewardship and social wellbeing at its core.\n\n【中文对照】西芒杜是一个复杂且具有独特变革意义的项目。从配套的基础设施走廊到该项目将创造的数千个就业岗位，它将对几内亚经济产生积极影响，创造惠及几内亚人民世世代代的机遇与发展潜力。\n\n与任何重大开发项目一样，各种挑战都需要审慎管理，包括最大限度地减少对社会、健康、安全和环境的不利影响，同时为当地社区和其他主要利益相关方带来积极而切实的改变。\n\n在我们参与西芒杜项目的整个历程中，我们始终坚持定期开展社区磋商，通过回应疑问与关切、提供更多支持，与当地社区保持对话。\n\n我们承诺按照国际公认的环境、社会和治理标准开发西芒杜项目，包括透明地报告采矿作业的影响，并继续与当地利益相关方合作寻求缓解这些影响的方法。我们深知肩负的责任，并将自己视为自然资源的长期守护者。我们将继续与社区携手，确保西芒杜项目始终以环境管护和社会福祉为核心。"}]$j$::jsonb,
   to_timestamp(1794466211877 / 1000.0), to_timestamp(1794466211877 / 1000.0))
ON CONFLICT (id) DO UPDATE SET
  mine_name = EXCLUDED.mine_name, short_name = EXCLUDED.short_name, mine_type = EXCLUDED.mine_type,
  main_products = EXCLUDED.main_products, province = EXCLUDED.province, city = EXCLUDED.city,
  district = EXCLUDED.district, address = EXCLUDED.address, longitude = EXCLUDED.longitude,
  latitude = EXCLUDED.latitude, annual_capacity = EXCLUDED.annual_capacity, reserve = EXCLUDED.reserve,
  ore_grade = EXCLUDED.ore_grade, operator = EXCLUDED.operator, contact_person = EXCLUDED.contact_person,
  contact_phone = EXCLUDED.contact_phone, status = EXCLUDED.status, commissioned_year = EXCLUDED.commissioned_year,
  remark = EXCLUDED.remark, intro = EXCLUDED.intro, tagline = EXCLUDED.tagline, img_url = EXCLUDED.img_url,
  hero_url = EXCLUDED.hero_url, gallery_urls = EXCLUDED.gallery_urls, img_prompt = EXCLUDED.img_prompt,
  hero_prompt = EXCLUDED.hero_prompt, img_credit = EXCLUDED.img_credit, story = EXCLUDED.story,
  updated_at = EXCLUDED.updated_at;

-- ---- 2.1 mine 从表：产品 43 条 / 价格基准 30 条 / 合作伙伴 19 条 ----
DELETE FROM mine.mine_product;
DELETE FROM mine.mine_price_ref;
DELETE FROM mine.mine_partner;
INSERT INTO mine.mine_product
  (mine_id, name, category, spec, output, unit, grade, impurity, size, moisture, application, description, sort_no)
VALUES
  ('mmwemahb9', 'PB粉', '铁矿石', 'TFe 61.5%', 15500, '万吨/年', 'TFe 61.5%', 'Al₂O₃ 2.2% · SiO₂ 3.4% · P 0.08%', '-9.5mm 为主', '≈ 8.5%', '烧结', '皮尔巴拉混矿旗舰品种，约占产品组合 65%，亚洲钢厂烧结配矿的市场基准', 0),
  ('mmwemahb9', 'PB块', '铁矿石', 'TFe 62.5%', 8000, '万吨/年', 'TFe 62.5%', 'Al₂O₃ 1.8% · SiO₂ 2.5% · P 0.06%', '6.3-31.5mm', '≈ 4%', '高炉直接入炉', '无需烧结直接入炉，可降低钢厂工序能耗与排放', 1),
  ('mmwemahb9', '杨迪粉', '铁矿石', 'TFe 58%', 4000, '万吨/年', 'TFe 58%', 'Al₂O₃ 1.4% · SiO₂ 5.7% · P 0.05%', '-9.5mm 为主', '≈ 9%', '烧结', 'Yandicoogina 低铝褐铁矿，烧损高、成球性好，高铝矿降铝配矿的经典原料', 2),
  ('mmwemahb9', '罗布河粉', '铁矿石', 'TFe 57%', 3500, '万吨/年', 'TFe 57%', 'Al₂O₃ 2.5% · SiO₂ 5.8% · P 0.04%', '-9.5mm 为主', '≈ 9%', '烧结', '罗布河谷褐铁矿，低磷低铝，Mesa J 重产后重回主流供应', 3),
  ('mmwemahb9', '罗布河块', '铁矿石', 'TFe 57.5%', 1000, '万吨/年', 'TFe 57.5%', 'Al₂O₃ 2.0% · SiO₂ 4.5% · P 0.04%', '6.3-31.5mm', '≈ 6.5%', '高炉直接入炉', '中品位块矿，兼顾直接入炉经济性与杂质控制', 4),
  ('mmwemahb9', 'SP10（粉/块）', '铁矿石', 'TFe 58.5%', 3000, '万吨/年', 'TFe 58.5%', 'Al₂O₃ 2.5% · SiO₂ 5.0% · P 0.06%', '粉 -9.5mm / 块 6.3-31.5mm', '≈ 8%', '烧结 / 入炉', '与 PB 同矿体的低成本品种，帮助钢厂优化配矿成本', 5),
  ('mmwemahb9', 'IOC 精矿/球团（加拿大）', '铁矿石', 'TFe 66%', 1700, '万吨/年', 'TFe 66%', 'Al₂O₃ 0.5% · SiO₂ 2.0%', '精粉 -0.15mm / 球团 9-16mm', '≤ 2%', '烧结 / 高炉', '加拿大拉布拉多铁矿公司（IOC）低铝精矿与球团，北美与欧洲市场主力', 6),
  ('mmwemahb9', '铝土矿（Weipa/Amrun）', '铝·锂', 'Al₂O₃ ≈50%', 6000, '万吨/年', 'Al₂O₃ ≈50%', 'SiO₂ ≈5% · 有机物低', '三水铝石型', '—', '氧化铝原料', '昆士兰韦帕与 Amrun 矿区，全球品位最优的三水铝石铝土矿之一', 7),
  ('mmwemahb9', '氧化铝（Yarwun 等）', '铝·锂', 'Al₂O₃ ≥99%', 700, '万吨/年', 'Al₂O₃ ≥99%', 'SiO₂ ≤0.02%', '砂状/粉状', '—', '电解铝原料', '雅润炼厂氧化铝，供应太平洋地区自用电解厂与亚洲客户', 8),
  ('mmwemahb9', '电解铝（加/澳/新）', '铝·锂', 'Al ≥99.7%', 320, '万吨/年', 'Al ≥99.7%', 'Fe ≤0.20% · Si ≤0.10%', '铝锭 / 原铝液', '—', '铝加工 / 铸造', '依托清洁水电的加拿大与新西兰电解厂，低碳铝全球领先', 9),
  ('mmwemahb9', '锂（碳酸锂当量）', '铝·锂', '电池级 Li₂CO₃', 20, '万吨LCE/年', '电池级', '—', '碳酸锂 / 氢氧化锂', '—', '动力电池', '收购 Arcadium 后跻身全球锂业龙头：阿根廷 Rincon、Sal de Vida、Fénix 在建，2028 年目标 20 万吨 LCE', 10),
  ('mmwemahb9', '铜（Kennecott/奥尤陶勒盖）', '铜', 'Cu 25-30%（精矿）', 85, '万吨/年', 'Cu 25-30%', 'As 低 · Au/Ag 伴生', '铜精矿 / 阴极铜', '—', '电线电缆 / 新能源', '美国肯尼科特一体化铜矿 + 蒙古奥尤陶勒盖（建成后全球第四大铜矿），含铜量口径', 11),
  ('mmwemahb9', '副产金银钼碲（Kennecott）', '铜', '金·银·钼·碲', 30, '万盎司/年', 'Au 精矿含金', '—', '精矿 / 精炼金属', '—', '贵金属 / 特种合金', '肯尼科特铜矿伴生资源：金约 30 万盎司/年，另有银、钼、碲（碲用于太阳能薄膜）', 12),
  ('mmwemahb9', '硼酸盐（加州 Boron）', '工业矿物', 'B₂O₃ 46-47%', 50, '万吨/年', 'B₂O₃ ≈47%', '—', '精矿 / 硼酸 / 硼砂', '—', '玻璃 / 陶瓷 / 农业', '莫哈韦沙漠波隆矿区，全球硼酸盐领导者，满足全球约三成需求', 13),
  ('mmwemahb9', '钛渣（RTIT 加/南非）', '工业矿物', 'TiO₂ ≈80%', 110, '万吨/年', 'TiO₂ 80%+', 'FeO ≈10%', '钛渣 / 高钛渣', '—', '钛白粉原料', '加拿大 Lac Tio 钛铁矿与魁北克 Sorel-Tracy 冶金综合体，钛白粉颜料工业核心原料，副产氧化钪与铁粉', 14),
  ('mmwemahb9', '盐（Dampier Salt）', '工业矿物', 'NaCl ≥99.5%', 500, '万吨/年', 'NaCl ≥99.5%', '—', '日晒海盐', '—', '化工 / 食用盐', '丹皮尔盐业：世界最大日晒盐场之一，位于西澳皮尔巴拉海岸', 15),
  ('mmwemahba', '纽曼粉', '铁矿石', 'TFe 62%', 12000, '万吨/年', 'TFe 62%', 'Al₂O₃ 2.3% · SiO₂ 4.4% · P 0.08%', '-9.5mm 为主', '≈ 8%', '烧结', '纽曼山主流中高品位粉矿，烧结基础配矿品种之一', 0),
  ('mmwemahba', '麦克粉', '铁矿石', 'TFe 62%', 9000, '万吨/年', 'TFe 62%', 'Al₂O₃ 2.1% · SiO₂ 3.4% · P 0.06%', '-9.5mm 为主', '≈ 8%', '烧结', 'Mining Area C 低硅高品位粉矿，与纽曼粉形成互补的烧结搭配', 1),
  ('mmwemahba', '块矿', '铁矿石', 'TFe 64%', 8000, '万吨/年', 'TFe 64%', 'Al₂O₃ 1.4% · SiO₂ 3.0% · P 0.08%', '6.3-31.5mm', '≈ 3%', '高炉直接入炉', '南坡（South Flank）与纽曼高品位直入炉块矿，可替代部分烧结矿降低工序能耗', 2),
  ('mmwemahba', '铜精矿（Escondida 智利）', '铜', 'Cu 25-35%', 130, '万吨/年', 'Cu 25-35%', 'Mo · Au 伴生', '铜精矿', '≈ 8%', '铜冶炼', '智利埃斯康迪达——全球最大铜矿，BHP 持股 57.5%，含铜量口径', 3),
  ('mmwemahba', '阴极铜/精矿（南澳 Copper SA）', '铜', 'Cu 99.99%', 40, '万吨/年', 'Cu 99.99%', '—', '阴极铜 / 铜精矿', '—', '电线电缆 / 新能源', '南澳奥林匹克坝、Prominent Hill 与 Carrapateena 一体化铜铀金矿群', 4),
  ('mmwemahba', '副产金银铀（南澳/智利）', '铜', '金·银·铀', 74, '万盎司/年', 'Au 精矿含金', '—', '精矿 / 精炼金属', '—', '贵金属 / 核燃料', 'FY25 金产量约 74 万盎司、银约 3,000 万盎司，另有铀（奥林匹克坝）与钼副产', 5),
  ('mmwemahba', '硬焦煤（BMA 昆士兰）', '冶金煤', 'CSR 65+', 5000, '万吨/年', 'CSR 65+', '灰分 ≈9% · S ≈0.6%', '洗精煤', '≈ 9%', '焦炉炼焦', '鲍恩盆地 BMA 合资：世界最大冶金煤出口商之一，供应亚洲与欧洲钢厂', 6),
  ('mmwemahba', '喷吹煤（PCI）', '冶金煤', '灰分 ≤10%', 2000, '万吨/年', '灰分 ≤10%', 'S ≤0.5%', '粉煤', '≈ 10%', '高炉喷吹', '高炉喷吹用煤，替代部分焦炭降低炼铁成本与排放', 7),
  ('mmwemahba', '钾盐（Jansen，建设中）', '钾盐', 'KCl ≥95%', 435, '万吨/年', 'KCl ≥95%', '—', '标准钾肥 / 颗粒钾肥', '—', '农业肥料', '加拿大萨斯喀彻温 Jansen 项目：一期 2027 年中投产、设计产能 435 万吨/年，加拿大最大钾盐项目', 8),
  ('mmwemahba', '镍（西澳镍业）', '镍', '镍锍 / 镍精矿', NULL, '万吨/年', 'Ni 75%+（镍锍）', '—', '镍锍', '—', '不锈钢 / 电池', '西澳镍业（Nickel West / West Musgrave）自 2024 年 12 月起临时停产，2027 年 2 月前复审复产决策', 9),
  ('mmwemahbb', '卡拉加斯粉（IOCJ）', '铁矿石', 'TFe 65%', 9000, '万吨/年', 'TFe 65%', 'Al₂O₃ 2.2% · SiO₂ 2.8% · P 0.075%', '≤12.7mm 为主', '≈ 8%', '烧结', '全球品位标杆性粉矿，低铝低硅，北部系统（卡拉加斯/S11D）旗舰产品', 0),
  ('mmwemahbb', '卡拉加斯块', '铁矿石', 'TFe 66%', 2000, '万吨/年', 'TFe 66%', 'Al₂O₃ 1.8% · SiO₂ 2.0% · P 0.06%', '6.3-31.5mm', '≈ 4%', '高炉直接入炉', '全球最高品位块矿之一，直接入炉降低烧结工序依赖', 1),
  ('mmwemahbb', '巴西混合粉（BRBF）', '铁矿石', 'TFe 62%', 6000, '万吨/年', 'TFe 62%', 'Al₂O₃ 1.5% · SiO₂ 6.0% · P 0.07%', '-9.5mm 为主', '≈ 8.5%', '烧结', '北部与东南系统混配的旗舰粉矿，品质稳定、均衡性好', 2),
  ('mmwemahbb', 'IOCJ 精粉', '铁矿石', 'TFe 65%', 1000, '万吨/年', 'TFe 65%', 'Al₂O₃ 0.8% · SiO₂ 1.5% · P 0.04%', '精粉，-0.15mm 为主', '≈ 9%', '烧结', '低铝优质精粉，铝硅极低，用于提质降杂的高品位配矿', 3),
  ('mmwemahbb', '球团矿（图巴朗/阿曼）', '铁矿石', 'TFe 65%', 3000, '万吨/年', 'TFe 65%', 'Al₂O₃ 1.0% · SiO₂ 2.5%', '8-16mm', '≤ 2%', '高炉 / 直接还原', '图巴朗与阿曼球团厂氧化球团，还原性好、强度高，2025 年产量约 3,200 万吨', 4),
  ('mmwemahbb', '绿色压块（Tubarão）', '铁矿石', 'TFe 66%+', 600, '万吨/年', 'TFe 66%+', '低硅低铝', '压块', '≤ 3%', '直接还原 / 高炉', '革命性低碳产品：以压块替代球团，显著降低炼铁排放；图巴朗 2×600 万吨产线陆续投产', 5),
  ('mmwemahbb', 'GF88 超细粉（舟山枢纽）', '铁矿石', '-88μm', 300, '万吨/年', 'TFe 66%+', '—', '超细磨矿粉', '≈ 10%', '球团 / 精细烧结', '与中国宁波舟山港合建的首个磨矿枢纽产品，靠近终端市场的增值加工', 6),
  ('mmwemahbb', '镍（Onça Puma/Voisey''s Bay 等）', '镍', '镍锍 Ni ≥75%', 16, '万吨/年', 'Ni ≥75%', 'Co · Cu 伴生', '镍锍 / 镍精矿', '—', '不锈钢 / 电池', '巴西 Onça Puma、加拿大 Voisey''s Bay 与印尼索罗瓦科，2025 年产量约 16 万吨', 7),
  ('mmwemahbb', '铜精矿（Salobo/Sossego）', '铜', 'Cu 25-30%', 35, '万吨/年', 'Cu 25-30%', 'Au · Ag 伴生', '铜精矿 / 阴极铜', '≈ 8%', '铜冶炼', '卡拉加斯 Salobo 创历史产量纪录，与 Sossego 合计 2025 年约 34-40 万吨', 8),
  ('mmwemahbb', '锰矿石（Azul）', '锰', 'Mn 40%+', 250, '万吨/年', 'Mn 40%+', 'Fe · SiO₂ 适中', '块矿 / 粉矿', '≈ 8%', '铁合金', '卡拉加斯配套 Azul 锰矿——全球最大锰矿之一，供应铁合金与电池级锰原料', 9),
  ('mmwemahbc', '超特粉', '铁矿石', 'TFe 56.5%', 7600, '万吨/年', 'TFe 56.5%', 'Al₂O₃ 2.7% · SiO₂ 5.8% · P 0.05% · Mn 1.1%', '-9.5mm 为主', '≈ 9%', '烧结', 'Chichester 枢纽旗舰产品，占发运约四成，高锰低磷的低成本大产量品种', 0),
  ('mmwemahbc', '混合粉', '铁矿石', 'TFe 58.2%', 6600, '万吨/年', 'TFe 58.2%', 'Al₂O₃ 2.2% · SiO₂ 4.3% · P 0.05%', '-9.5mm 为主', '≈ 9%', '烧结', 'Fortescue Blend：Christmas Creek 与 Firetail 混配，性价比路线的代表品种', 1),
  ('mmwemahbc', '西皮粉（WPF）', '铁矿石', 'TFe 60.1%', 2300, '万吨/年', 'TFe 60.1%', 'Al₂O₃ 2.0% · SiO₂ 5.5% · P 0.06%', '-9.5mm 为主', '≈ 9%', '烧结', '西皮尔巴拉粉（West Pilbara Fines），FMG 品位升级战略的主力中品粉矿', 2),
  ('mmwemahbc', 'King 粉（CID）', '铁矿石', 'TFe 55%', 500, '万吨/年', 'TFe 55%', 'Al₂O₃ 2.5% · SiO₂ 5.5% · P 0.05%', '-9.5mm 为主', '≈ 9%', '烧结', 'Kings 通道铁矿（CID）独立产品，补充低成本配矿选项', 3),
  ('mmwemahbc', 'Iron Bridge 磁铁矿精矿', '铁矿石', 'TFe 67%', 2000, '万吨/年', 'TFe 67%', 'Al₂O₃ 0.3% · SiO₂ 2.5%', '磁铁矿精矿，-0.5mm', '≈ 9%', '球团 / 高品位配矿', '世界级高品位磁铁矿项目：满产 2,200 万吨/年，对 65% 品位指数溢价定价', 4),
  ('mmwemahbd', '西芒杜高品位粉', '铁矿石', 'TFe 65%', 3500, '万吨/年', 'TFe 65%', 'Al₂O₃ ≈1.0% · SiO₂ ≈2.0%', '-9.5mm 为主', '≈ 8%', '烧结', '新投产的高品位粉矿，低铝低硅，有望成为高品位配矿新基准；JORC 资源品位 66-67.1%', 0),
  ('mmwemahbd', '西芒杜块矿', '铁矿石', 'TFe 66%', 2500, '万吨/年', 'TFe 66%', 'Al₂O₃ ≈1.0% · SiO₂ ≈2.0%', '6.3-31.5mm', '≈ 3%', '高炉直接入炉', '全球最高品位块矿之一，直接入炉比例提升的关键资源；项目远期产能 1.2 亿吨/年（四大区块）', 1);
INSERT INTO mine.mine_price_ref
  (mine_id, name, tag, product, value, unit, delta, direction, updated, source, sort_no)
VALUES
  ('mmwemahb9', '北矿指数 · 北矿所基准价（62%）', '官方指数', '62% 品位粉矿 · 平台成交', 103.2, '美元/干吨', '+1.10', 'up', '2026-10-30', '北京国际矿业权交易所（北铁中心 COREX）发布的铁矿石现货交易基准价（62% 品位），基于平台成交价、申报价与线下成交价加权平均生成，已纳入上海清算所铁矿石掉期结算价格', 0),
  ('mmwemahb9', '国际标准价 · 普氏 IODEX', '国际标准', '62% Fe 铁矿石 · CFR 中国', 103.45, '美元/干吨', '+0.62', 'up', '2026-10-30', 'S&P Global 普氏能源资讯发布的 62% 品位铁矿石中国到岸（CFR）现货评估，美元计价，是 ICE 普氏 IODEX 期货及上海清算所人民币铁矿石掉期的结算基准', 1),
  ('mmwemahb9', '国内现货价 · Mysteel 青岛港', '国内现货', '61.5% PB粉 · 港口现货', 768, '元/湿吨', '+3.0', 'up', '2026-10-30', '我的钢铁网（Mysteel）铁矿石港口现货价格指数，以青岛港为标准交割地，反映进口矿港口人民币现货水平', 2),
  ('mmwemahb9', '国内期货价 · 大商所铁矿石期货', '国内期货', '主力合约 I · 结算价', 812.5, '元/吨', '-4.5', 'down', '2026-10-30', '大连商品交易所铁矿石期货主力合约结算价（合约代码 I），实物交割（交割质量标准 F/DCE I004-2021），国内铁矿石现货贸易的期货定价基准', 3),
  ('mmwemahb9', '新加坡掉期 · SGX TSI', '场外掉期', '62% Fe 掉期 · CFR 中国', 102.85, '美元/干吨', '+0.95', 'up', '2026-10-30', '新加坡交易所铁矿石掉期（SGX TSI 62% Fe CFR 中国），2009 年起以 TSI 指数为结算与清算基础，全球铁矿石衍生品主要场外市场', 4),
  ('mmwemahb9', 'CIOPI 中国铁矿石价格指数', '官方指数', '62% 进口铁矿石指数', 104.1, '指数点', '+1.30', 'up', '2026-10-30', '中国钢铁工业协会、中国五矿化工进出口商会、中国冶金矿山企业协会联合发布，含进口矿与国产矿两类指数', 5),
  ('mmwemahba', '北矿指数 · 北矿所基准价（62%）', '官方指数', '62% 品位粉矿 · 平台成交', 103.2, '美元/干吨', '+1.10', 'up', '2026-10-30', '北京国际矿业权交易所（北铁中心 COREX）发布的铁矿石现货交易基准价（62% 品位），基于平台成交价、申报价与线下成交价加权平均生成，已纳入上海清算所铁矿石掉期结算价格', 0),
  ('mmwemahba', '国际标准价 · 普氏 IODEX', '国际标准', '62% Fe 铁矿石 · CFR 中国', 103.45, '美元/干吨', '+0.62', 'up', '2026-10-30', 'S&P Global 普氏能源资讯发布的 62% 品位铁矿石中国到岸（CFR）现货评估，美元计价，是 ICE 普氏 IODEX 期货及上海清算所人民币铁矿石掉期的结算基准', 1),
  ('mmwemahba', '国内现货价 · Mysteel 青岛港', '国内现货', '62% 纽曼粉 · 港口现货', 772.5, '元/湿吨', '+3.5', 'up', '2026-10-30', '我的钢铁网（Mysteel）铁矿石港口现货价格指数，以青岛港为标准交割地，反映进口矿港口人民币现货水平', 2),
  ('mmwemahba', '国内期货价 · 大商所铁矿石期货', '国内期货', '主力合约 I · 结算价', 812.5, '元/吨', '-4.5', 'down', '2026-10-30', '大连商品交易所铁矿石期货主力合约结算价（合约代码 I），实物交割（交割质量标准 F/DCE I004-2021），国内铁矿石现货贸易的期货定价基准', 3),
  ('mmwemahba', '新加坡掉期 · SGX TSI', '场外掉期', '62% Fe 掉期 · CFR 中国', 102.85, '美元/干吨', '+0.95', 'up', '2026-10-30', '新加坡交易所铁矿石掉期（SGX TSI 62% Fe CFR 中国），2009 年起以 TSI 指数为结算与清算基础，全球铁矿石衍生品主要场外市场', 4),
  ('mmwemahba', 'CIOPI 中国铁矿石价格指数', '官方指数', '62% 进口铁矿石指数', 104.1, '指数点', '+1.30', 'up', '2026-10-30', '中国钢铁工业协会、中国五矿化工进出口商会、中国冶金矿山企业协会联合发布，含进口矿与国产矿两类指数', 5),
  ('mmwemahbb', '北矿指数 · 北矿所基准价（65%）', '官方指数', '65% 品位粉矿 · 平台成交', 117.3, '美元/干吨', '+1.40', 'up', '2026-10-30', '北京国际矿业权交易所（北铁中心 COREX）发布的铁矿石现货交易基准价（65% 品位），基于平台成交价、申报价与线下成交价加权平均生成，已纳入上海清算所铁矿石掉期结算价格', 0),
  ('mmwemahbb', '国际标准价 · 普氏 IODEX', '国际标准', '65% Fe 铁矿石 · CFR 中国', 118.6, '美元/干吨', '+0.80', 'up', '2026-10-30', 'S&P Global 普氏能源资讯发布的高品位铁矿石中国到岸（CFR）现货评估，美元计价，为国际市场高品位矿定价参考基准', 1),
  ('mmwemahbb', '国内现货价 · Mysteel 青岛港', '国内现货', '65% 卡拉加斯粉 · 港口现货', 856, '元/湿吨', '+4.0', 'up', '2026-10-30', '我的钢铁网（Mysteel）铁矿石港口现货价格指数，以青岛港为标准交割地，反映进口矿港口人民币现货水平', 2),
  ('mmwemahbb', '国内期货价 · 大商所铁矿石期货', '国内期货', '主力合约 I · 结算价', 812.5, '元/吨', '-4.5', 'down', '2026-10-30', '大连商品交易所铁矿石期货主力合约结算价（合约代码 I），实物交割（交割质量标准 F/DCE I004-2021），国内铁矿石现货贸易的期货定价基准', 3),
  ('mmwemahbb', '新加坡掉期 · SGX TSI', '场外掉期', '65% Fe 掉期 · CFR 中国', 117.9, '美元/干吨', '+1.10', 'up', '2026-10-30', '新加坡交易所高品位铁矿石掉期（SGX TSI 65% Fe CFR 中国），以 TSI 指数为结算与清算基础，全球铁矿石衍生品主要场外市场', 4),
  ('mmwemahbb', 'CIOPI 中国铁矿石价格指数', '官方指数', '62% 进口铁矿石指数', 104.1, '指数点', '+1.30', 'up', '2026-10-30', '中国钢铁工业协会、中国五矿化工进出口商会、中国冶金矿山企业协会联合发布，含进口矿与国产矿两类指数', 5),
  ('mmwemahbc', '北矿指数 · 北矿所基准价（62%）', '官方指数', '62% 品位粉矿 · 平台成交', 103.2, '美元/干吨', '+1.10', 'up', '2026-10-30', '北京国际矿业权交易所（北铁中心 COREX）发布的铁矿石现货交易基准价（62% 品位），基于平台成交价、申报价与线下成交价加权平均生成，已纳入上海清算所铁矿石掉期结算价格', 0),
  ('mmwemahbc', '国际标准价 · 普氏 IODEX', '国际标准', '62% Fe 铁矿石 · CFR 中国', 103.45, '美元/干吨', '+0.62', 'up', '2026-10-30', 'S&P Global 普氏能源资讯发布的 62% 品位铁矿石中国到岸（CFR）现货评估，美元计价，是 ICE 普氏 IODEX 期货及上海清算所人民币铁矿石掉期的结算基准', 1),
  ('mmwemahbc', '国内现货价 · Mysteel 青岛港', '国内现货', '58.2% 混合粉 · 港口现货', 692, '元/湿吨', '+2.5', 'up', '2026-10-30', '我的钢铁网（Mysteel）铁矿石港口现货价格指数，以青岛港为标准交割地，反映进口矿港口人民币现货水平', 2),
  ('mmwemahbc', '国内期货价 · 大商所铁矿石期货', '国内期货', '主力合约 I · 结算价', 812.5, '元/吨', '-4.5', 'down', '2026-10-30', '大连商品交易所铁矿石期货主力合约结算价（合约代码 I），实物交割（交割质量标准 F/DCE I004-2021），国内铁矿石现货贸易的期货定价基准', 3),
  ('mmwemahbc', '新加坡掉期 · SGX TSI', '场外掉期', '62% Fe 掉期 · CFR 中国', 102.85, '美元/干吨', '+0.95', 'up', '2026-10-30', '新加坡交易所铁矿石掉期（SGX TSI 62% Fe CFR 中国），2009 年起以 TSI 指数为结算与清算基础，全球铁矿石衍生品主要场外市场', 4),
  ('mmwemahbc', 'CIOPI 中国铁矿石价格指数', '官方指数', '62% 进口铁矿石指数', 104.1, '指数点', '+1.30', 'up', '2026-10-30', '中国钢铁工业协会、中国五矿化工进出口商会、中国冶金矿山企业协会联合发布，含进口矿与国产矿两类指数', 5),
  ('mmwemahbd', '北矿指数 · 北矿所基准价（65%）', '官方指数', '65% 品位粉矿 · 平台成交', 117.3, '美元/干吨', '+1.40', 'up', '2026-10-30', '北京国际矿业权交易所（北铁中心 COREX）发布的铁矿石现货交易基准价（65% 品位），基于平台成交价、申报价与线下成交价加权平均生成，已纳入上海清算所铁矿石掉期结算价格', 0),
  ('mmwemahbd', '国际标准价 · 普氏 IODEX', '国际标准', '65% Fe 铁矿石 · CFR 中国', 118.6, '美元/干吨', '+0.80', 'up', '2026-10-30', 'S&P Global 普氏能源资讯发布的高品位铁矿石中国到岸（CFR）现货评估，美元计价，为国际市场高品位矿定价参考基准', 1),
  ('mmwemahbd', '国内现货价 · Mysteel 青岛港', '国内现货', '65% 高品位粉 · 港口现货（新货种）', 862, '元/湿吨', '+4.5', 'up', '2026-10-30', '我的钢铁网（Mysteel）铁矿石港口现货价格指数，以青岛港为标准交割地，反映进口矿港口人民币现货水平', 2),
  ('mmwemahbd', '国内期货价 · 大商所铁矿石期货', '国内期货', '主力合约 I · 结算价', 812.5, '元/吨', '-4.5', 'down', '2026-10-30', '大连商品交易所铁矿石期货主力合约结算价（合约代码 I），实物交割（交割质量标准 F/DCE I004-2021），国内铁矿石现货贸易的期货定价基准', 3),
  ('mmwemahbd', '新加坡掉期 · SGX TSI', '场外掉期', '65% Fe 掉期 · CFR 中国', 117.9, '美元/干吨', '+1.10', 'up', '2026-10-30', '新加坡交易所高品位铁矿石掉期（SGX TSI 65% Fe CFR 中国），以 TSI 指数为结算与清算基础，全球铁矿石衍生品主要场外市场', 4),
  ('mmwemahbd', 'CIOPI 中国铁矿石价格指数', '官方指数', '62% 进口铁矿石指数', 104.1, '指数点', '+1.30', 'up', '2026-10-30', '中国钢铁工业协会、中国五矿化工进出口商会、中国冶金矿山企业协会联合发布，含进口矿与国产矿两类指数', 5);
INSERT INTO mine.mine_partner
  (mine_id, name, type, scale, scale_value, period, status, remark, sort_no)
VALUES
  ('mmwemahb9', '宝武集团', 'steel', '年采购 3,200 万吨', 3200, '2021 至今 · 5 年', 'strategic', '与宝武原料采购中心签署战略合作，年度长协+季度调整，青岛港/日照港到岸', 0),
  ('mmwemahb9', '鞍钢集团', 'steel', '年采购 1,500 万吨', 1500, '2018 至今 · 7 年', 'lt', '年度长协，丹皮尔港发运，信用证结算', 1),
  ('mmwemahb9', '中钢集团', 'trader', '年代理分销 900 万吨', 900, '2015 至今 · 10 年', 'lt', '央企代理分销通道，覆盖华北钢厂二级市场，长协与现货混合结算', 2),
  ('mmwemahb9', '托克（Trafigura）', 'trader', '年贸易 700 万吨', 700, '2019 至今 · 6 年', 'spot', '国际贸易商，CFR 中国主要接货方，转口贸易与人民币现货并行', 3),
  ('mmwemahba', '宝武集团', 'steel', '年采购 2,800 万吨', 2800, '2016 至今 · 9 年', 'strategic', '宝武与 BHP 战略合作框架，黑德兰港发运，含人民币计价结算试点', 0),
  ('mmwemahba', '河钢集团', 'steel', '年采购 1,300 万吨', 1300, '2012 至今 · 13 年', 'lt', '河钢国际物流统一采购，年度长协+季度浮动定价', 1),
  ('mmwemahba', '厦门建发股份', 'trader', '年贸易 800 万吨', 800, '2017 至今 · 8 年', 'spot', '建发物流港口现货分销，覆盖东南沿海钢厂', 2),
  ('mmwemahba', '厦门国贸集团', 'trader', '年贸易 650 万吨', 650, '2018 至今 · 7 年', 'spot', '进口代理+现货分销，人民币现货交易活跃', 3),
  ('mmwemahbb', '宝武集团', 'steel', '年采购 3,500 万吨', 3500, '2002 至今 · 23 年', 'strategic', '宝武与 Vale 长期战略合作，图巴朗港发运，含绿色压块采购试点', 0),
  ('mmwemahbb', '山钢集团', 'steel', '年采购 900 万吨', 900, '2014 至今 · 11 年', 'lt', '年度长协，青岛港到岸分销，卡拉加斯粉为主', 1),
  ('mmwemahbb', '浙江物产中大', 'trader', '年贸易 750 万吨', 750, '2016 至今 · 9 年', 'spot', '物产中大集团港口现货分销，覆盖长三角钢厂', 2),
  ('mmwemahbb', '华菱钢铁', 'steel', '年采购 600 万吨', 600, '2019 至今 · 6 年', 'lt', '湘钢/涟钢配矿需求，BRBF 长协占比高', 3),
  ('mmwemahbc', '沙钢集团', 'steel', '年采购 1,600 万吨', 1600, '2014 至今 · 11 年', 'lt', '沙钢为超特粉最大用户之一，黑德兰港发运，性价比配矿核心供应', 0),
  ('mmwemahbc', '日照钢铁', 'steel', '年采购 950 万吨', 950, '2015 至今 · 10 年', 'spot', '以现货招标为主，港口现货与长协结合', 1),
  ('mmwemahbc', '华菱钢铁', 'steel', '年采购 700 万吨', 700, '2017 至今 · 8 年', 'lt', '混合粉/超特粉配比使用，年度长协框架', 2),
  ('mmwemahbc', '厦门国贸集团', 'trader', '年贸易 600 万吨', 600, '2019 至今 · 6 年', 'spot', '现货分销与代理进口结合，覆盖华南市场', 3),
  ('mmwemahbd', '宝武集团', 'steel', '规划年采购 1,600 万吨', 1600, '2025 年 12 月起 · 首船已发运', 'strategic', '宝武为西芒杜项目中方股东之一，投产初期承接包销与战略采购', 0),
  ('mmwemahbd', '中钢集团', 'trader', '年包销 800 万吨', 800, '2025 年起 · 5 年包销', 'lt', '中钢集团首批包销协议，经莫雷巴亚港发运', 1),
  ('mmwemahbd', '厦门建发股份', 'trader', '年贸易 500 万吨', 500, '2026 年起', 'spot', '高品位新货种现货试单，青岛港接货分销', 2);

-- ---- 3. ocean.ocean_voyage（6 条航次，mine_id 关联矿山主数据）----
INSERT INTO ocean.ocean_voyage
  (id, voyage_code, vessel_name, mine_id, mine_name, load_port, load_country, discharge_port, discharge_country,
   cargo_type, quantity, freight_rate, freight_total, sail_date, eta_date, status, remark, created_by, created_at, updated_at)
VALUES
  ('vmwemahcj', 'S-001', 'Pacific Glory', 'mmwemahb9', '力拓',
   '丹皮尔港', '澳大利亚', '青岛港', '中国',
   'PB粉', 17, 21.5, 3655000,
   DATE '2026-11-07', DATE '2026-11-18', 'sailing', NULL, '系统预置',
   to_timestamp(1794034211923 / 1000.0), to_timestamp(1794552611923 / 1000.0)),
  ('vmwemahck', 'S-002', 'Bulk Venture', 'mmwemahba', '必和必拓',
   '黑德兰港', '澳大利亚', '曹妃甸港', '中国',
   '纽曼粉', 18, 20.8, 3744000,
   DATE '2026-11-09', DATE '2026-11-09', 'pending', NULL, '系统预置',
   to_timestamp(1794207011923 / 1000.0), to_timestamp(1794552611923 / 1000.0)),
  ('vmwemahcl', 'S-003', 'Vale Rio Doce', 'mmwemahbb', '淡水河谷',
   '图巴朗港', '巴西', '青岛港', '中国',
   '卡拉加斯粉', 30, 32.5, 9750000,
   DATE '2026-11-01', DATE '2026-12-11', 'sailing', NULL, '系统预置',
   to_timestamp(1793515811923 / 1000.0), to_timestamp(1794552611923 / 1000.0)),
  ('vmwemahcm', 'S-004', 'Iron Chieftain', 'mmwemahbc', '福斯特库',
   '黑德兰港', '澳大利亚', '日照港', '中国',
   '超特粉', 17.5, 19.2, 3360000,
   DATE '2026-10-24', DATE '2026-11-03', 'arrived', NULL, '系统预置',
   to_timestamp(1792824611923 / 1000.0), to_timestamp(1794552611923 / 1000.0)),
  ('vmwemahcn', 'S-005', 'Pilbara Spirit', 'mmwemahb9', '力拓',
   '丹皮尔港', '澳大利亚', '舟山港', '中国',
   '杨迪粉', 16.8, 22, 3696000,
   DATE '2026-09-29', DATE '2026-10-11', 'done', NULL, '系统预置',
   to_timestamp(1790664611923 / 1000.0), to_timestamp(1794552611923 / 1000.0)),
  ('vmwemahco', 'S-006', 'Minas Gerais', 'mmwemahbb', '淡水河谷',
   '图巴朗港', '巴西', '湛江港', '中国',
   'IOCJ', 28, 31.8, 8904000,
   DATE '2026-11-11', DATE '2026-11-11', 'loading', NULL, '系统预置',
   to_timestamp(1794379811923 / 1000.0), to_timestamp(1794552611923 / 1000.0))
ON CONFLICT (voyage_code) DO UPDATE SET
  vessel_name = EXCLUDED.vessel_name, mine_id = EXCLUDED.mine_id, mine_name = EXCLUDED.mine_name,
  load_port = EXCLUDED.load_port, load_country = EXCLUDED.load_country,
  discharge_port = EXCLUDED.discharge_port, discharge_country = EXCLUDED.discharge_country,
  cargo_type = EXCLUDED.cargo_type, quantity = EXCLUDED.quantity, freight_rate = EXCLUDED.freight_rate,
  freight_total = EXCLUDED.freight_total, sail_date = EXCLUDED.sail_date, eta_date = EXCLUDED.eta_date,
  status = EXCLUDED.status, remark = EXCLUDED.remark, updated_at = EXCLUDED.updated_at;

-- ---- 3.1 ocean.ocean_voyage_sync（5 条同步映射演示）----
DELETE FROM ocean.ocean_voyage_sync;
INSERT INTO ocean.ocean_voyage_sync (voyage_id, source_module, source_id, source_ref, sync_rule)
VALUES
((SELECT id FROM ocean.ocean_voyage WHERE id = 'vmwemahcm'), 'order_ledger', 'o-seed-001', 'HZ202608150001', 'ledger_voyage_link'),
((SELECT id FROM ocean.ocean_voyage WHERE id = 'vmwemahcj'), 'order_ledger', 'o-seed-002', 'HZ202608300001', 'ledger_voyage_link'),
((SELECT id FROM ocean.ocean_voyage WHERE id = 'vmwemahck'), 'order_ledger', 'o-seed-003', 'HZ202609140001', 'ledger_voyage_link'),
((SELECT id FROM ocean.ocean_voyage WHERE id = 'vmwemahcl'), 'order_ledger', 'o-seed-004', 'HZ202609140002', 'ledger_voyage_link'),
((SELECT id FROM ocean.ocean_voyage WHERE voyage_code = 'S-006'), 'manual', NULL, '手工录入演示航次', 'manual_entry');

-- ---- 3.2 ocean.ocean_spot（20 条港口现货）+ pricing.iron_ore_index（同源镜像）----
DELETE FROM ocean.ocean_spot;
INSERT INTO ocean.ocean_spot
  (no, port, variety, fe, sio2, al2o3, p, s, mn, moisture, vessel, berth, data_date, data_source)
VALUES
  (1, '京唐港', '卡拉拉精粉', 62.33, 12.06, 0.12, 0.032, 0.067, NULL, 8.5, 'SM SAMCHEONPO（三千浦）', '一公司', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (2, '黄骅港', '米纳斯精粉', 66.92, 2.8, 0.53, 0.025, NULL, 0.03, 8.7, 'SHANDONG DREAM（山东梦想）', '矿石2场940-990米、矿石700-740米，矿石11场', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (3, '黄骅港', '卡拉拉精粉', 62.1, 12.38, 0.2, 0.03, 0.036, NULL, 8.69, 'JIN WEN FENG（锦文峰）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (4, '青岛港', 'KBH南非铁精粉', 62.45, 2.16, 0.46, 0.19, 0.041, NULL, 6.54, 'ANASTASIA（安纳斯塔西娅）', '重象口', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (5, '青岛港', 'SFGB', 54.94, 14.54, 2.11, 0.068, NULL, 0.287, 8.3, 'ORE ZHOUSHAN（矿石舟山）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (6, '青岛港', '塞拉利昂烧结精粉', 61.22, 6.27, 3.38, 0.041, 0.005, NULL, 10.62, 'SEABREEZE（海洋清风）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (7, '日照港', 'KMG块', 51.66, 22.51, 1.31, 0.01, 0.018, NULL, 2.07, 'DEE4 OAK（橡树）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (8, '日照港', 'YGBZ块', 62.11, 8.95, 0.86, 0.03, 0.01, NULL, 1.31, 'MALINDI（马林迪）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (9, '日照港', '塞拉利昂DSO粉', 55.21, 3.07, 6.55, 0.068, 0.004, NULL, 12.64, 'SAMC TRANSPORTER（海瀛撮运）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (10, '岚山港', '罗伊山NEXUS粉', 57.218, 7.378, 3.175, 0.047, 0.035, NULL, 9.89, 'MV HUI ZHEN HAI（惠珍海）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (11, '岚山港', 'LONS块', 49.5, 18.46, 1.53, 0.05, NULL, 0.162, 4.5, 'SHINE ON（照耀）', '装港指标', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (11, '岚山港', 'LONS筛后块', 49.72, 17.652, 1.62, 0.0466, NULL, 0.148, 2.71, 'SHINE ON（照耀）', '卸港CCIC', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (11, '岚山港', 'LONS筛后粉', 51.56, 16.576, 2.211, 0.0562, NULL, 0.254, 8.39, 'SHINE ON（照耀）', '卸港CCIC', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (12, '岚山港', 'LONS块', 53.75, 14.23, 1.97, 0.059, NULL, 0.215, 4.8, 'PAN DREAM（潘梦）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (13, '岚山港', 'KMG粉', 47.95, 24.92, 2.63, 0.01, 0.012, NULL, 4.07, 'GREAT LINK（大联）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (14, '连云港', '卡拉拉精粉', 62.16, 12.27, 0.1, 0.028, 0.034, NULL, 8.08, 'SIFNOS I（锡弗诺斯）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (15, '连云港', 'LONS筛后块', 49.89, 17.78, 1.95, 0.066, NULL, 0.015, 0.54, 'ALONA（阿罗那）', '卸港CCIC', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (15, '连云港', 'LONS筛后粉', 54.17, 15.18, 2.29, 0.08, NULL, 0.015, 5.01, 'ALONA（阿罗那）', '卸港CCIC', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (16, '镇江港', '罗伊山NEXUS粉', 57.218, 7.378, 3.175, 0.047, 0.035, NULL, 9.89, 'MV HUI ZHEN HAI（惠珍海）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (17, '湛江港', 'SFGB', 54.64, 15.29, 2.18, 0.065, NULL, 0.293, 8.6, 'GRAND WISDOM（裕智）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货');
DELETE FROM pricing.iron_ore_index;
INSERT INTO pricing.iron_ore_index
  (no, port, variety, fe, sio2, al2o3, p, s, mn, moisture, vessel, berth, data_date, data_source)
VALUES
  (1, '京唐港', '卡拉拉精粉', 62.33, 12.06, 0.12, 0.032, 0.067, NULL, 8.5, 'SM SAMCHEONPO（三千浦）', '一公司', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (2, '黄骅港', '米纳斯精粉', 66.92, 2.8, 0.53, 0.025, NULL, 0.03, 8.7, 'SHANDONG DREAM（山东梦想）', '矿石2场940-990米、矿石700-740米，矿石11场', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (3, '黄骅港', '卡拉拉精粉', 62.1, 12.38, 0.2, 0.03, 0.036, NULL, 8.69, 'JIN WEN FENG（锦文峰）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (4, '青岛港', 'KBH南非铁精粉', 62.45, 2.16, 0.46, 0.19, 0.041, NULL, 6.54, 'ANASTASIA（安纳斯塔西娅）', '重象口', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (5, '青岛港', 'SFGB', 54.94, 14.54, 2.11, 0.068, NULL, 0.287, 8.3, 'ORE ZHOUSHAN（矿石舟山）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (6, '青岛港', '塞拉利昂烧结精粉', 61.22, 6.27, 3.38, 0.041, 0.005, NULL, 10.62, 'SEABREEZE（海洋清风）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (7, '日照港', 'KMG块', 51.66, 22.51, 1.31, 0.01, 0.018, NULL, 2.07, 'DEE4 OAK（橡树）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (8, '日照港', 'YGBZ块', 62.11, 8.95, 0.86, 0.03, 0.01, NULL, 1.31, 'MALINDI（马林迪）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (9, '日照港', '塞拉利昂DSO粉', 55.21, 3.07, 6.55, 0.068, 0.004, NULL, 12.64, 'SAMC TRANSPORTER（海瀛撮运）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (10, '岚山港', '罗伊山NEXUS粉', 57.218, 7.378, 3.175, 0.047, 0.035, NULL, 9.89, 'MV HUI ZHEN HAI（惠珍海）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (11, '岚山港', 'LONS块', 49.5, 18.46, 1.53, 0.05, NULL, 0.162, 4.5, 'SHINE ON（照耀）', '装港指标', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (11, '岚山港', 'LONS筛后块', 49.72, 17.652, 1.62, 0.0466, NULL, 0.148, 2.71, 'SHINE ON（照耀）', '卸港CCIC', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (11, '岚山港', 'LONS筛后粉', 51.56, 16.576, 2.211, 0.0562, NULL, 0.254, 8.39, 'SHINE ON（照耀）', '卸港CCIC', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (12, '岚山港', 'LONS块', 53.75, 14.23, 1.97, 0.059, NULL, 0.215, 4.8, 'PAN DREAM（潘梦）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (13, '岚山港', 'KMG粉', 47.95, 24.92, 2.63, 0.01, 0.012, NULL, 4.07, 'GREAT LINK（大联）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (14, '连云港', '卡拉拉精粉', 62.16, 12.27, 0.1, 0.028, 0.034, NULL, 8.08, 'SIFNOS I（锡弗诺斯）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (15, '连云港', 'LONS筛后块', 49.89, 17.78, 1.95, 0.066, NULL, 0.015, 0.54, 'ALONA（阿罗那）', '卸港CCIC', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (15, '连云港', 'LONS筛后粉', 54.17, 15.18, 2.29, 0.08, NULL, 0.015, 5.01, 'ALONA（阿罗那）', '卸港CCIC', DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (16, '镇江港', '罗伊山NEXUS粉', 57.218, 7.378, 3.175, 0.047, 0.035, NULL, 9.89, 'MV HUI ZHEN HAI（惠珍海）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货'),
  (17, '湛江港', 'SFGB', 54.64, 15.29, 2.18, 0.065, NULL, 0.293, 8.6, 'GRAND WISDOM（裕智）', NULL, DATE '2026-05-25', '中国矿产·中矿国链港口现货');

-- ---- 3.3 ocean.ocean_coa（1 条质检证书）+ 检验项 ----
DELETE FROM ocean.ocean_coa_item;
DELETE FROM ocean.ocean_coa;
INSERT INTO ocean.ocean_coa
  (id, certificate_no, shipment_no, vessel, mine, port, issued_date)
VALUES
  ('coamwemahcj', '810190245', '416919', 'G.P. ZAFIRAKIS', NULL, '丹皮尔港', DATE '2026-08-18')
ON CONFLICT (id) DO NOTHING;
INSERT INTO ocean.ocean_coa_item (coa_id, item_name, item_value, sort_no)
VALUES
('coamwemahcj', '原产地', 'Australia（澳大利亚）', 0),
('coamwemahcj', '提单日期', '2026-08-18', 1),
('coamwemahcj', '货物名称', 'PILBARA BLEND FINES（PB粉）', 2),
('coamwemahcj', '湿吨', 175795, 3),
('coamwemahcj', '干吨', 160806.312, 4),
('coamwemahcj', '水分 %', 8.64, 5),
('coamwemahcj', '+63mm 物理 %', 12.689, 6),
('coamwemahcj', 'Fe %', 61.12, 7),
('coamwemahcj', 'P %', 0.106, 8),
('coamwemahcj', 'S %', 0.018, 9),
('coamwemahcj', 'SiO2 %', 4.15, 10),
('coamwemahcj', 'Al2O3 %', 2.36, 11),
('coamwemahcj', '烧失量 LOI %', 5.23, 12),
('coamwemahcj', '备注', '签发方：Rio Tinto Commercial Pte. Ltd.（新加坡）', 13);

-- ---- 4. port.port_info（2 家港口）+ 港区/集疏运通道 ----
INSERT INTO port.port_info (id, name, subtitle, photo, intro, metrics, basic_info, capacity, sort_no)
VALUES
  ('port-huanghua', '黄骅港', '河北省沧州市·渤海沿岸', '/ports/assets/huanghua-port.png', '津冀沿海港口群的重要组成部分，我国西煤东运、北煤南运重要枢纽港口，国家能源运输大通道的关键节点', $j$[{"label":"年吞吐量","value":"3.66亿 / 119万标箱","unit":"","note":"数据时间：2025年"},{"label":"年设计通过能力","value":"2.89亿 / 95万标箱","unit":"","note":"数据时间：2025年"},{"label":"泊位数量","value":"47","unit":"个","note":"数据时间：2025年"},{"label":"最大泊位吨级","value":"20","unit":"万吨"}]$j$::jsonb, $j$[{"label":"港口名称","value":"黄骅港"},{"label":"所属地区","value":"河北省沧州市黄骅市"},{"label":"始建时间","value":"1984年"},{"label":"行政管理部门","value":"沧州市海洋和港航管理局"},{"label":"主营业务货类","value":"煤炭、矿石、集装箱、液体化工等"}]$j$::jsonb, $j$[{"label":"集疏港铁路","value":"朔黄铁路、邯黄铁路、沧港铁路"},{"label":"集疏港公路","value":"黄石高速、荣乌高速、秦滨高速"}]$j$::jsonb, 0),
  ('port-tianjin', '天津港', '天津市滨海新区·渤海沿岸', '/ports/assets/tianjin-port.png', '京津冀的海上门户，是中蒙俄经济走廊东部起点、新亚欧大陆桥重要节点、21世纪海上丝绸之路战略支点', $j$[{"label":"年吞吐量","value":"5.95亿 / 2403万标箱","unit":"","note":"数据时间：2025年"},{"label":"年设计通过能力","value":"—","unit":"","note":"数据时间：2025年"},{"label":"泊位数量","value":"213","unit":"个","note":"数据时间：2025年"},{"label":"最大泊位吨级","value":"30","unit":"万吨"}]$j$::jsonb, $j$[{"label":"港口名称","value":"天津港"},{"label":"所属地区","value":"天津市滨海新区"},{"label":"始建时间","value":"1951年"},{"label":"行政管理部门","value":"天津港股份有限公司"},{"label":"主营业务货类","value":"集装箱、铁矿石、石油及制品、钢材、煤炭等"}]$j$::jsonb, $j$[{"label":"集疏港铁路","value":"黄万铁路、朔黄铁路、西南环线、新港北铁路集装箱中心站"},{"label":"集疏港公路","value":"滨保高速、京津高速、京津塘高速、津晋高速、京石高速、滨海大道、塘承高速、秦滨高速、长深高速"}]$j$::jsonb, 1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, subtitle = EXCLUDED.subtitle, photo = EXCLUDED.photo, intro = EXCLUDED.intro,
  metrics = EXCLUDED.metrics, basic_info = EXCLUDED.basic_info, capacity = EXCLUDED.capacity,
  updated_at = now();
DELETE FROM port.port_zone;
DELETE FROM port.port_channel;
INSERT INTO port.port_zone (port_id, name, location, positioning, facilities, sort_no)
VALUES
  ('port-huanghua', '综合港区', '黄骅港最北端', '以集装箱、粮食、滚装、成品油、液体化工品及其他散杂货运输为主，承担临港工业及腹地物资中转运输、综合物流服务等功能，是黄骅港的大型综合性港区。', $j$"建有集装箱码头、滚装码头、通用散杂货码头、粮食码头及液体化工品码头等。"$j$::jsonb, 0),
  ('port-huanghua', '散货港区', '综合港区以南、煤炭港区以北', '以铁矿石、原油等大宗散货物资运输为主，兼顾煤炭、成品油、液化天然气等其他散货运输，主要建设大型专业化散货码头，满足临港工业和腹地散货运输需求。', $j$"建有大型专业化矿石码头（如20万吨级、25万吨级矿石泊位）、煤炭码头、原油码头及通用散货码头等。"$j$::jsonb, 1),
  ('port-huanghua', '煤炭港区', '散货港区以南、河口港区以北', '黄骅港的核心能源港区，主要承担煤炭下水（北煤南运）功能，是黄骅港煤炭运输的保供核心，为国家级能源运输大通道的关键节点。', $j$"建有大型煤炭专业化泊位（如5万吨级、10万吨级煤炭泊位）及相应的煤炭堆场、翻车机房等后方配套设施。"$j$::jsonb, 2),
  ('port-huanghua', '河口港区', '黄骅港最南端（宣惠河口）', '为补充性港区，主要承担煤炭、建材及部分散杂货运输，因受泥沙淤积影响，船舶靠泊受限，发展空间相对有限。', $j$"建有煤炭泊位、建材泊位及部分通用散杂货泊位等。"$j$::jsonb, 3),
  ('port-tianjin', '北疆港区', '天津港主航道以北，北至永定新河口，西至海防路，东至东疆港区。', '天津港综合性主港区、核心主力集装箱港区，兼顾商品汽车、件杂货，是华北集装箱进出口最主要作业区。', $j$"天津港集装箱码头、国际联盟码头、欧亚国际码头、C段智能化集装箱码头（全球首个智慧零碳码头）及北疆集装箱物流中心。"$j$::jsonb, 10),
  ('port-tianjin', '东疆港区', '北疆港区以东，天津港主航道以东区域。', '集装箱+邮轮母港，天津航运服务业高地，天津自贸区核心板块，重点发展航运金融、融资租赁、跨境电商等高端航运服务。', $j$"太平洋集装箱码头、天津国际邮轮母港、东疆保税港区、大冷链物流园区。"$j$::jsonb, 11),
  ('port-tianjin', '南疆港区', '天津港主航道以南，北至海河口，为东西长、南北窄的条状人工岛。', '国家能源、大宗原材料中转港区（散货能源港），以煤炭、铁矿石、原油、LNG等能源类货物中转为主，以铁路、管道集疏运为主。', $j$"天津港焦炭码头、天津港远航矿石码头、天津港散货物流中心。"$j$::jsonb, 12),
  ('port-tianjin', '大沽口港区', '海河入海口南侧，大沽口区域。', '临港工业配套港区（工业港），服务临港经济区，以钢铁、粮食、矿建、液体化工品、重大件等运输为主，兼顾部分中转运输。', $j$"临港工业区配套码头、天津港汇盛码头等。"$j$::jsonb, 13),
  ('port-tianjin', '高沙岭港区', '天津港北部，滨海新区南部。', '远期集装箱拓展区，承接北疆外迁的杂货、散货，服务后方临港制造业，远期预留集装箱发展空间。', $j$"产业配套码头、预留集装箱码头空间。"$j$::jsonb, 14),
  ('port-tianjin', '大港港区（南港片区）', '天津港南部，南港工业区配套区域。', '化工专用港区，服务南港石化新材料产业园，以油品、LNG、液体化工品、部分干散货运输为主。', $j$"南港化工配套码头、LNG接收站、油品及液体化工品专用码头。"$j$::jsonb, 15),
  ('port-tianjin', '北塘港区（含中心渔港）', '天津港北部，北塘区域。', '城市配套型港区，货运逐步收缩，北区以冷链物流运输（国家骨干冷链基地）为主，南区以滨海旅游客运、休闲文旅为主。', $j$"冷链物流园区、旅游客运码头。"$j$::jsonb, 16),
  ('port-tianjin', '海河港区', '海河下游，海河二道闸以下河段（海河两岸）。', '城市内河港区，货运逐步退出，未来主要发展内河观光旅游客运，兼顾城市短途工业物料、小型临港码头。', $j$"小型临港码头、旅游客运码头。"$j$::jsonb, 17);
INSERT INTO port.port_channel (port_id, channel, route, via, cost, sort_no)
VALUES
  ('port-huanghua', '黄骅港铁路直达', '黄骅港经邯黄铁路、沧港铁路、京沪、京广铁路到达武安保税', '—', '91.6 元/吨', 0),
  ('port-huanghua', '黄骅港公铁联运', '黄骅港经邯黄铁路到达曹庄镇站后经汽运运输至武安保税', '曹庄镇站', '87 元/吨', 1),
  ('port-huanghua', '黄骅港公铁联运', '黄骅港经邯黄铁路到达邢台南站后经汽运运输至武安保税', '邢台南站', '93 元/吨', 2),
  ('port-huanghua', '黄骅港汽运直达', '黄骅港汽运运输至武安保税', '—', '81 元/吨', 3);

-- ---- 5. rail.rail_supplier（2 家）+ 联系人 ----
INSERT INTO rail.rail_supplier (id, name, short_name, site, facts, intro, fees, sort_no)
VALUES
  ('rs-canggang', '沧州沧港铁路有限公司', '沧港铁路', 'https://www.czcgtl.com', $j$[{"label":"统一社会信用代码","value":"91130983695867945E","mono":true},{"label":"法定代表人","value":"刘永亮"},{"label":"注册资本","value":"34788.47万元"},{"label":"成立日期","value":"2009-10-22"},{"label":"经营状态","value":"存续","ok":true},{"label":"企业类型","value":"有限责任公司（台港澳与境内合资）"},{"label":"注册地址","value":"河北省沧州市黄骅市羊二庄镇杨庄火车站"},{"label":"国标行业","value":"装卸搬运"},{"label":"企业规模","value":"大型"},{"label":"主营业务","value":"铁路货运"},{"label":"辅助业务","value":"装卸；道路货运；建设、保养及维修等"}]$j$::jsonb, $j$["国内首家地方铁路上市公司。以河北省为基地，核心运营沧港铁路货运系统，连接京沪铁路与黄骅港，承担\"西煤东运\"重要任务。2026年，开通黄骅港至冀中南铁矿石运输新通道，依托沧港铁路成熟既有路网资源，成功构建起黄骅港进口铁矿石经京沪铁路直达冀中南地区的海铁联运新链路。"]$j$::jsonb, $j${"items":["1、铁路运输包干服务费用包括以下内容：","（1）邯黄运输综合服务费 13 元/吨（含 9% 的税）。","（2）沧港运输综合服务费 13.75 元/吨（其中铁路运费 11.65 元/吨，含 9% 的税；取送车费 2.1 元/吨，含 6% 的税）。","（3）沧州站经国铁到乙方指定到站运费如下（含 9% 的税）："],"tables":[{"headers":["车型","发站","到站","固定单价（元/箱）"],"rows":[["70吨级","沧州","武安","1675.84"],["70吨级","沧州","康城","1657.28"],["70吨级","沧州","磁山","1717.44"],["60吨级","沧州","武安","1416.42"],["60吨级","沧州","康城","1401.03"],["60吨级","沧州","磁山","1451.79"]]}]}$j$::jsonb, 0),
  ('rs-jiandou', '河北建投交通多式联运有限责任公司', '建投多式联运', NULL, $j$[{"label":"统一社会信用代码","value":"91130104MAK95D1R1W","mono":true},{"label":"法定代表人","value":"杨晓乐"},{"label":"注册资本","value":"5000万元"},{"label":"成立日期","value":"2026-03-23"},{"label":"经营状态","value":"存续","ok":true},{"label":"企业类型","value":"有限责任公司（非自然人投资或控股的法人独资）"},{"label":"注册地址","value":"河北省石家庄市桥西区"},{"label":"国标行业","value":"集装箱道路运输"},{"label":"企业规模","value":"中型"},{"label":"主营业务","value":"多式联运、国际班列运输、数字化与供应链物流"},{"label":"辅助业务","value":"仓储与集散；物流园与货场运营；综合物流服务"}]$j$::jsonb, $j$["由河北建投交通投资有限责任公司100%控股。依托邯黄铁路、和邢铁路、建投铁路为核心资源，着力构建\"通道+枢纽+平台\"现代化物流体系。","以公铁、铁海联运为核心任务，开展中欧、中亚国际班列运输业务，打通货源揽收、干线运输、仓储集散、末端配送一体化物流体系。"]$j$::jsonb, $j${"items":["运费实行包干价结算，包括从渤海西站至曹庄镇站铁路运输的各项费用（不含港杂），具体费用如下："],"tables":[{"headers":["费用项目","单价（元/吨）","税率"],"rows":[["铁路运输包干价（渤海西站至曹庄镇站，不含港杂）","44","9%"],["到站装卸及服务费","6.6","6%"]]}]}$j$::jsonb, 1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, short_name = EXCLUDED.short_name, site = EXCLUDED.site,
  facts = EXCLUDED.facts, intro = EXCLUDED.intro, fees = EXCLUDED.fees, updated_at = now();
DELETE FROM rail.rail_contact;
INSERT INTO rail.rail_contact (supplier_id, name, role, tel, sort_no)
VALUES
  ('rs-canggang', '苏轶州', NULL, '18032717609', 0),
  ('rs-jiandou', '杨婉莹', '市场开发部', '19930587087', 0);

-- ---- 6. transfer.transfer_station（3 个站点）----
INSERT INTO transfer.transfer_station
  (id, name, subtitle, photo, intro, metrics, basic_info, station_intro, scale, sort_no)
VALUES
  ('st-caozhuangzhen', '曹庄镇站', '河北省邯郸市鸡泽县曹庄镇·邯黄铁路沿线', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=railway%20freight%20station%20in%20north%20china%20plain%2C%20container%20yard%20with%20stacked%20shipping%20containers%2C%20blue%20gantry%20crane%2C%20electrified%20tracks%20with%20freight%20wagons%2C%20clear%20daylight%2C%20realistic%20photography&image_size=landscape_16_9', '邯黄铁路沿线重要中转节点，承担大宗货物装卸、仓储集散与公铁换装功能，衔接黄骅港方向铁海联运班列', $j$[{"label":"设计年装卸能力","value":"200","unit":"万吨"},{"label":"货场面积","value":"20","unit":"万㎡"},{"label":"货物线","value":"2","unit":"条"}]$j$::jsonb, $j$[{"label":"站点名称","value":"曹庄镇站"},{"label":"所属线路","value":"邯黄铁路"},{"label":"所属地区","value":"河北省邯郸市鸡泽县曹庄镇"},{"label":"站点性质","value":"货运站、中间站"},{"label":"运行时间","value":"2025年"},{"label":"隶属铁路局","value":"中国铁路北京局集团有限公司"},{"label":"车站等级","value":"四级"}]$j$::jsonb, '2025年，启动铁路线延长工程，曹庄镇站轨道由450米延长至1050米，装卸能力预计560万吨/年。具备20、40英尺集装箱及整车发到作业能力，可满足整列火车直接进出装卸。现已实现东盟班列常态化运行，成为京津冀地区唯一常态化运行的"中国—东盟"陆地运输通道。', '货场1处，横列式布置，货物线2条，有效长度450米，装卸作业时需对整列解编为半列列车推送进入。', 0),
  ('st-xingtainan', '邢台南站', NULL, 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20railway%20freight%20logistics%20yard%2C%20gantry%20cranes%20over%20rail%20sidings%2C%20container%20handling%20area%20and%20warehouses%2C%20sunny%20day%2C%20realistic%20photography&image_size=landscape_16_9', '邯黄铁路（邢台至黄骅港铁路）上的重要中间站，主要承担煤炭、玻璃、粮食、农产品、钢材等大宗货物的运输任务，通过邯黄铁路与沿海港口实现海铁联运，是冀中南地区重要的物流节点。', $j$[{"label":"实际货运量","value":"667.2","unit":"万吨","note":"数据时间2024年"},{"label":"货场面积","value":"25.5","unit":"万㎡"},{"label":"铁路线路总数","value":"4","unit":"条"}]$j$::jsonb, $j$[{"label":"站点名称","value":"邢台南站"},{"label":"所属线路","value":"邯黄铁路"},{"label":"所属地区","value":"河北省邢台市"},{"label":"站点性质","value":"货运站、中间站"},{"label":"运行时间","value":"2013年"},{"label":"隶属铁路局","value":"中国铁路北京局集团有限公司"},{"label":"车站等级","value":"-"}]$j$::jsonb, '邢台南站主要承担煤炭、玻璃、粮食、农产品、钢材等大宗货物的运输任务。车站通过邯黄铁路与天津港、黄骅港、唐山港等沿海港口实现海铁联运，是冀中南地区重要的物流节点。2024年，该站全年累计完成货物运输量667.2万吨，同比增长23.2%', '一台四线（含正线1条），侧式站台。货场面积25.5万平方米，占地386亩，日吞吐量达5000吨。', 1),
  ('st-kangcheng', '康城站', NULL, 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=bulk%20cargo%20railway%20freight%20terminal%2C%20raw%20material%20stockpile%20yard%20with%20loader%20machine%2C%20hopper%20freight%20wagons%20on%20tracks%2C%20industrial%20scenery%2C%20realistic%20photography&image_size=landscape_16_9', '邯长铁路沿线车站，2024年6月，邯长线康城站改造工程正式开通运营，进一步提升了该站的货运功能，强化了与铁路运输的衔接，有效缓解了公路运输压力，促进了区域经济发展', $j$[{"label":"实际货运量","value":"-"},{"label":"货场面积","value":"-"},{"label":"装卸线数量","value":"8","unit":"条"}]$j$::jsonb, $j$[{"label":"站点名称","value":"康城站"},{"label":"所属线路","value":"邯长铁路"},{"label":"所属地区","value":"河北省武安市"},{"label":"站点性质","value":"客货运站、中间站"},{"label":"运行时间","value":"1943年"},{"label":"隶属铁路局","value":"中国铁路北京局集团有限公司"},{"label":"车站等级","value":"三级"}]$j$::jsonb, '康城站是邯郸站与武安站之间的一个重要中间站，连接着京广铁路与沙午铁路方向。距离邯郸站23公里。其上下行区间均已实现电气化', '车站设有到发线8条（含正线2条），有效长度为871m~1044m。', 2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, subtitle = EXCLUDED.subtitle, photo = EXCLUDED.photo, intro = EXCLUDED.intro,
  metrics = EXCLUDED.metrics, basic_info = EXCLUDED.basic_info, station_intro = EXCLUDED.station_intro,
  scale = EXCLUDED.scale, updated_at = now();

-- ---- 7. wh.wh_supplier（2 家）+ 垛位 12 个 + 矿种目录 14 种 ----
INSERT INTO wh.wh_supplier
  (id, name, type, contact, phone, address, throughput, storage, area, intro, facilities, remark, created_at)
VALUES
  ('sup-001', '河北陆港保税物流有限公司', '保税物流', NULL, NULL, '河北省邯郸市武安市（武安保税物流中心）',
   '设计年货物处理量3000万吨', NULL, '规划占地1600亩', '河北港口集团旗下核心物流载体，运营河北省首家B型保税物流中心——武安保税物流中心，业务涵盖保税物流、铁路运输、钢材交易、再生钢铁、混矿加工、供应链金融、跨境电商、仓储交割八大板块。"河北陆港—天津等港口"铁水联运线路入选国家级典型案例，2024年完成联运量21.6万标箱，2021—2024年累计74.97万标箱，货源以武安地区钢厂原料等大宗货物为主。', $j$"中心依托万利丰铁路专用线建设，设海关监管区、内贸物流区、综合服务区、行政商业区四大功能区，具备保税存储、出口退税、国际贸易与转口贸易等功能；铁水联运通道连通天津港、曹妃甸港、山东港口，提供集装箱短驳进站、装箱调偏、报关清关、预约提箱、跨境电商通关等配套服务。"$j$::jsonb, NULL, to_timestamp(1794552611909 / 1000.0)),
  ('sup-002', '河北南洋移山物流有限公司', '运输接驳', '李勇旺', '0310-6287117', '河北省邯郸市武安市南环东路1001号',
   '300万吨级智慧物流园（规划）', NULL, '约146亩（仓储用地）', '成立于2011年6月，注册资本5250万元，注册地位于邯郸武安市南环东路1001号。主营道路货物运输（普通、罐车、冷藏、大件、集装箱）、货运站场经营、铁路货物运输服务与汽车维修等，投资建设南洋（移山）智慧物流园，旗下全资持有武安市南洋石油销售有限公司。', $j$"仓储地块位于武安东环路东侧、邯武快速路南侧（仓储用地约146亩）；运营南洋物流园，承担武安市区邮政快件分拨（15公里直封直投），园区配套货运站场、汽车维修及成品油补给等服务。"$j$::jsonb, NULL, to_timestamp(1794552611909 / 1000.0))
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, contact = EXCLUDED.contact, phone = EXCLUDED.phone,
  address = EXCLUDED.address, throughput = EXCLUDED.throughput, storage = EXCLUDED.storage,
  area = EXCLUDED.area, intro = EXCLUDED.intro, facilities = EXCLUDED.facilities, remark = EXCLUDED.remark;
DELETE FROM wh.wh_stack;
INSERT INTO wh.wh_stack (supplier_id, name, ore, tonnage, note, sort_no)
VALUES
  ('sup-001', '1号垛', 'PB粉', 2.5, NULL, 0),
  ('sup-001', '2号垛', '纽曼粉', 1.8, NULL, 1),
  ('sup-001', '3号垛', '巴西混合粉', 1.5, NULL, 2),
  ('sup-001', '4号垛', 'PB块', 1.2, NULL, 3),
  ('sup-001', '5号垛', '超特粉', 1, NULL, 4),
  ('sup-001', '6号垛', '金布巴粉', 0.8, NULL, 5),
  ('sup-002', '1号垛', 'PB粉', 0.6, NULL, 0),
  ('sup-002', '2号垛', '混合粉', 0.4, NULL, 1),
  ('sup-002', '3号垛', '磁铁精粉', 0.3, '邯邢本地矿', 2),
  ('sup-002', '4号垛', '巴西混合粉', 0.3, NULL, 3),
  ('sup-002', '5号垛', 'FMG混合粉', 0.2, NULL, 4),
  ('sup-002', '6号垛', '罗布河混合粉', 0.2, NULL, 5);
INSERT INTO wh.wh_ore_catalog (ore_name, sort_no) VALUES
  ('PB粉', 0),
  ('PB块', 1),
  ('纽曼粉', 2),
  ('纽曼块', 3),
  ('麦克粉', 4),
  ('巴西混合粉', 5),
  ('FMG混合粉', 6),
  ('罗布河混合粉', 7),
  ('超特粉', 8),
  ('金布巴粉', 9),
  ('混合粉', 10),
  ('磁铁精粉', 11),
  ('罗布河粉', 12),
  ('扬迪粉', 13)
ON CONFLICT (ore_name) DO UPDATE SET sort_no = EXCLUDED.sort_no;

-- ---- 8. fleet.fleet_info（2 家车队）----
INSERT INTO fleet.fleet_info
  (id, name, type, contact, phone, address, capacity, fleet_size, min_guarantee, max_capacity, remark, created_at)
VALUES
  ('fleet-001', '河北中惠供应链管理有限公司', '合作', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, to_timestamp(1794552611918 / 1000.0)),
  ('fleet-002', '渤海新合运输车队', '外协', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, to_timestamp(1794552611918 / 1000.0))
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, contact = EXCLUDED.contact, phone = EXCLUDED.phone,
  address = EXCLUDED.address, capacity = EXCLUDED.capacity, fleet_size = EXCLUDED.fleet_size,
  min_guarantee = EXCLUDED.min_guarantee, max_capacity = EXCLUDED.max_capacity, remark = EXCLUDED.remark;

-- ---- 9. steel.steel_mill（11 家钢厂）----
INSERT INTO steel.steel_mill
  (id, name, type, contact, phone, address, capacity, ore_demand, nature, founded, reg_time, reg_capital, reg_address, products, intro, remark, created_at)
VALUES
  ('steel-001', '河北普阳钢铁有限公司', '长期合作', NULL, NULL, '河北省邯郸武安市阳邑镇东500米',
   '600万吨/年（铁、钢、材配套）', '约950万吨/年（按产能估算）：进口矿以澳矿PB粉/块、FMG混合粉为主，配加邯邢本地磁铁精粉及巴西矿、块矿球团', '中外合资', '1992年', '1992-10-05', '4.56亿美元（45600万美元）',
   '河北省邯郸武安市阳邑镇', '中厚板（高强钢、耐磨钢、容器钢、管线钢、船板·八国船级社认证、风塔钢、桥梁钢、模具钢）、热轧卷板（硅钢基料、马口铁基料、汽车大梁钢、车轮钢）、冷轧带钢（无取向硅钢、镀锌铝镁、彩涂）', '始建于1992年，位于邯郸太行山东麓、革命老区武安市阳邑镇，毗邻青兰高速与309国道，具有年产铁、钢、材各600万吨的生产能力，是河北省知名的中厚板生产基地——拥有5条中厚板生产线，可生产6—120mm厚度钢板，产量约占全国中厚板总产量的10%；2024年完成粗钢485万吨、铁水336万吨，总资产980亿元，环保绩效A级企业，自2005年连年上榜中国企业500强，并与东北大学国家重点实验室合作研发高附加值品种钢。', NULL, to_timestamp(1794552611920 / 1000.0)),
  ('steel-002', '邯郸钢铁集团有限责任公司（河钢邯钢）', '稳定合作', NULL, NULL, '河北省邯郸市复兴区（邯钢新区位于涉县）',
   '优质钢产能1105万吨/年', '约1750万吨/年（估算）：以力拓、淡水河谷、必和必拓、FMG四大矿山长协进口矿为主，配加河钢矿业自产铁精粉（资源掌控量39亿吨）', '国有企业（河钢集团核心企业）', '1958年', '1995-12-28', '25亿元（250000万元）',
   '邯郸市复兴路232号', '超低碳家电板（黑色家电深冲件）、汽车用钢、管线钢、优特钢、重轨、优质中板（品种钢为主）', '河钢集团核心企业，1958年建厂，现有职工1.8万人，优质钢产能1105万吨/年，是国家重要的精品板材和优特钢生产基地，培育了汽车用钢、家电用钢、优特钢、重轨、优质中板、管线钢、特种气体等系列品牌产品；原复兴区老厂（炼铁产能707万吨/年、炼钢产能595万吨/年）已于2022年12月退城关停，产能整体转移至涉县邯钢新区。', NULL, to_timestamp(1794552611920 / 1000.0)),
  ('steel-003', '新兴铸管股份有限公司', '稳定合作', NULL, NULL, '河北省武安市上洛阳村北（2672厂区）',
   '武安本部产品总产能约300万吨/年', '2024年实际采购铁矿石约1332万吨：进口矿约75%自用，其余经进口代理对外分销；配加国产精粉', '央企控股上市公司（新兴际华集团）', '20世纪70年代', '1997-05-24', '约39.63亿元（396318.23万元）',
   '河北省武安市上洛阳村北（二六七二厂区）', '球墨铸铁管、管铸件、钢格板（产量居世界首位、国内市占30%以上）、优特钢（斗齿钢国内市占前3、外贸高强合金）、热轧带肋钢筋', '深交所上市央企（股票代码000778），国务院国资委监管的新兴际华集团核心企业，是全球球墨铸铁管及管铸件研发制造商和竞争力较强的钢铁产品研发制造商。武安本部拥有1280m³钢铁高炉等3座高炉、2座80吨转炉及3条轧钢生产线，配套80万吨铸管生产线，产品总产能约300万吨；截至2024年末铸管年产能300万吨、管铸件年产能20万吨，生产基地遍布河北、安徽、湖北等区域。', NULL, to_timestamp(1794552611920 / 1000.0)),
  ('steel-004', '武安市裕华钢铁有限公司', '稳定合作', NULL, '0310-5752935', '河北省邯郸武安市上团城乡崇义四街村北',
   NULL, '自有矿山配套（集团矿业板块），外购以进口澳矿PB粉、巴西混矿为主，配加邯邢本地磁铁精粉', '民营企业', '2003年', '2003-03-28', '10亿元（100000万元）',
   '河北省邯郸武安市上团城乡崇义四街村北', '钢坯、热轧带肋钢筋（HRB400/HRB400E/HRB500）、热轧优质线材、热轧卷板', '成立于2003年3月，占地约3800余亩，现有固定资产650亿元、员工3万余人（集团口径），旗下设有钢铁冶炼、矿山资源、金融投资、国际贸易、循环经济、生态旅游、环保科技、铁路物流等多个板块；系河北省重点钢铁企业、省钢铁协会副会长单位、中国钢铁工业协会会员单位，国家工信部第一批"钢铁规范管理"认定企业。', '电话为公司公开登记电话，采购专线待补充', to_timestamp(1794552611920 / 1000.0)),
  ('steel-005', '河北文安钢铁集团有限公司', '潜在合作', NULL, NULL, '河北省邯郸武安市',
   '年轧材约300万吨', '自有邯邢文辉矿业（西石门、玉石洼铁矿）供应磁铁精粉，不足部分外购进口粉矿', '民营企业', '1993年', '2003-12-26', '约65.36亿元（653635万元）',
   '河北省邯郸武安市', '热轧带钢（110万吨/年）、热轧光圆钢筋、热轧圆盘条、高速线材（80万吨/年）', '始建于1993年，现有职工5000余人，已形成集矿山开采、烧结、炼铁、炼钢、轧钢于一体的钢铁联合企业；拥有200㎡烧结机1台、108㎡烧结机2台，510m³高炉2座、1080m³高炉1座、50吨转炉2座，以及年产80万吨高速线材生产线1条、110万吨热轧带钢生产线2条；正在实施产能减量置换升级改造优特钢项目（总投资69.7亿元，建设1430m³高炉、120吨转炉及1450热轧生产线）。', NULL, to_timestamp(1794552611920 / 1000.0)),
  ('steel-006', '河北永洋特钢集团有限公司', '潜在合作', NULL, NULL, '河北省邯郸市永年区永年特钢工业园区',
   '年产量400多万吨（2021年粗钢102万吨）', '约160万吨/年（按粗钢产量估算）：进口粉矿为主，配加邯邢本地磁铁精粉', '民营企业', '1993年', '1993-06-15', '4.17亿元（41700万元）',
   '河北省邯郸市永年区', '轻轨、重轨、起重机钢轨、矿用支护型钢、H型钢、弹簧扁钢', '成立于1993年，位于邯郸市永年区永年特钢工业园区，占地500多公顷（6000余亩），员工4000余人，年产量400多万吨，是全国规模最大、品种最多、规格最全的轻轨、重轨、矿山专用钢材生产基地，钢轨、起重机轨、矿工钢行业国家标准制定企业；累计投资13亿元引进活性焦脱硫脱硝干法一体化治理等环保工艺，达到钢铁行业超低排放标准；2021年实现销售收入79.43亿元。', NULL, to_timestamp(1794552611920 / 1000.0)),
  ('steel-007', '天津铁厂有限公司（天铁）', '潜在合作', NULL, NULL, '河北省邯郸市涉县更乐镇（冀·津循环经济示范区天铁工业区）',
   '炼铁304万吨、炼钢125万吨（升级改造后）', '约480万吨/年（按炼铁产能估算）：以进口矿为主（经天津港/曹妃甸港到港短倒），配加国产精粉', '国有企业（天津市属法人独资）', '1990年', '1990-03-05', '约70.1亿元（701039.48万元，实缴）',
   '河北省邯郸市涉县更乐镇', '生铁、钢锭、钢坯、特钢商品卷', '注册于邯郸涉县的天津市属大型钢铁联合企业，地处冀·津（涉县·天铁）循环经济产业示范区，员工6800余人；正在实施装备升级改造项目，一期建设1780m³高炉、110吨转炉、110吨LF精炼炉及方坯连铸机，项目完成后炼铁产能304万吨、炼钢产能125万吨；特钢板材品种拓宽项目形成年产特钢商品卷150万吨能力，另建有投资12亿元、年产氧气5.37亿立方米的制氧中心。', NULL, to_timestamp(1794552611920 / 1000.0)),
  ('steel-008', '河北太行钢铁集团有限公司', '潜在合作', NULL, '13785088578', '河北省邯郸武安市徘徊镇顺义庄村南（南洺河工业园）',
   '炼铁268万吨、炼钢280万吨（设计产能）', '约430万吨/年（按炼铁产能估算）：进口澳矿为主，配套球团链篦机回转窑使用进口精粉制球团', '民营企业', '2013年', '2013-09-02', '21.8亿元（218000万元）',
   '河北省邯郸武安市徘徊镇顺义庄村南', 'ESP无头轧制薄带钢（以热代冷，最薄约0.7mm）、热轧板卷', '位于武安市工业园区南洺河工业园，总资产200亿元、在职员工7000余人，高新技术企业、制造业单项冠军、绿色工厂。新厂区一期总投资约130亿元，2019年7月动工、2021年7月全线投产，占地4700亩，主要装备包括300㎡带式烧结机2台、球团链篦机回转窑1座等；尤其从欧洲引进的ESP生产线实现薄板"以热代冷"，工艺、设备、环保全部按世界一流技术水平装备；达产后年设计产能炼铁268万吨、炼钢280万吨，可实现营业收入149亿元、利税33亿元。', '电话为公司公开登记电话，采购专线待补充', to_timestamp(1794552611920 / 1000.0)),
  ('steel-009', '冀南钢铁集团有限公司', '潜在合作', NULL, NULL, '河北省邯郸武安市上团城镇兴凯街东侧',
   '炼钢产能315万吨（二期置换升级中）', '约430万吨/年（按置换后产能估算）：集团自有矿山配套，外购以进口澳矿、巴西矿为主，配加邯邢本地精粉', '民营企业（以裕华钢铁为骨干组建）', '2005年（集团2014年正式组建）', '2005-09-09', '13亿元（130000万元）',
   '河北省邯郸武安市上团城镇兴凯街东侧', '中厚板、热轧带钢、热轧卷板、高速线材、冷轧薄板、不锈钢板、H型钢、螺纹钢、铸造用生铁（26个系列2000余个规格；"冀南、裕冠、兴华、港陆"牌省名牌产品）', '坐落于"中国冶炼之乡"武安市，是以裕华钢铁为骨干组建的中国特大型民营钢铁集团，实质性兼并重组峰峰华信特钢、文丰钢铁、兴华钢铁、唐山港陆钢铁、唐山新宝泰、唐山国堂钢铁、山西裕福焦化、山西宝山矿业等公司；高新技术企业、制造业单项冠军企业，是业内少数具备全流程合规运营能力的钢铁企业之一；正在实施二期钢铁产能减量置换升级改造项目，炼钢产能315万吨（置换比例1.25:1）。', NULL, to_timestamp(1794552611920 / 1000.0)),
  ('steel-010', '金鼎钢铁集团有限公司', '潜在合作', NULL, NULL, '河北省邯郸武安工业园区青龙山工业园区',
   '钢铁产能800万吨（集团口径）', '约1280万吨/年（按集团钢铁产能估算）：进口矿为主，集团自有矿山及焦化板块配套', '民营企业（方同舟控股旗下）', '1995年（注册主体2002年）', '2002-07-19', '1.2亿元（12000万元）',
   '河北省邯郸市武安工业园区青龙山工业园区', '装配式建筑用钢、热轧卷板（超短流程轧制，最薄0.7mm、精品钢20余种）；焦化板块：焦炭、甲醇、LNG及焦油、粗苯、氢气等化工产品', '始建于1995年，隶属于方同舟控股有限公司，是一家集钢铁、焦化、矿山资源、装备制造、国际贸易、地产开发于一体的跨行业、跨区域综合性大型民营钢铁企业集团；集团现拥有钢铁产能800万吨、焦化产能1000万吨，年产值近1000亿元；成员企业金鼎重工有限公司位于武安市青龙山工业园，占地2600余亩。', NULL, to_timestamp(1794552611920 / 1000.0)),
  ('steel-011', '河北新金钢铁有限公司', '潜在合作', NULL, NULL, '河北省邯郸武安市骈山村东',
   NULL, '外购进口粉矿为主（澳矿、巴西矿），配加邯邢本地磁铁精粉', '民营企业', '1999年（集团始建1993年）', '1999-06-18', '7.88亿元（78800万元）',
   '河北省邯郸武安市骈山村东', '冷轧板、镀锌板、热轧板、高速线材、光伏发电用高强韧结构钢、家电板（3D打印定制化服务）', '新金集团骨干企业，集团始建于1993年，经30年转型升级形成以钢铁为主导产业，集科技、金融、投资、外贸、旅游、焦化、铸造、新能源等多项战略新兴产业协同发展的格局；多次跻身中国企业500强、中国制造业500强、河北省百强企业，先后荣获国家"首都蓝天行动科技示范工程"等百余项荣誉；正与河北永洋特钢、邯郸紫山特钢实施整合重组升级改造项目（产能减量置换）。', NULL, to_timestamp(1794552611920 / 1000.0))
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, contact = EXCLUDED.contact, phone = EXCLUDED.phone,
  address = EXCLUDED.address, capacity = EXCLUDED.capacity, ore_demand = EXCLUDED.ore_demand,
  nature = EXCLUDED.nature, founded = EXCLUDED.founded, reg_time = EXCLUDED.reg_time,
  reg_capital = EXCLUDED.reg_capital, reg_address = EXCLUDED.reg_address, products = EXCLUDED.products,
  intro = EXCLUDED.intro, remark = EXCLUDED.remark;

-- ---- 10. contract.contract（5 份）+ 模板 1 类 ----
INSERT INTO contract.contract
  (id, code, name, type, party_a, party_b, party_c, amount, received, paid, quantity, executed, sign_date, end_date, status)
VALUES
  ('c-seed-001', 'HZ-2026-001', '铁精粉采购合同（武安现货）', '采购合同', '河北泓泽宜通供应链管理有限公司', '武安市鑫源矿业有限公司', NULL,
   18600000, 9000000, 12000000, 30000, 18600,
   DATE '2026-01-10', DATE '2026-12-31', '履行中'),
  ('c-seed-002', 'HZ-2026-002', '钢坯销售合同（华北区域）', '销售合同', '河北泓泽宜通供应链管理有限公司', '河北新金钢铁有限公司', NULL,
   24300000, 15000000, 0, 40000, 26000,
   DATE '2026-02-18', DATE '2026-12-31', '履行中'),
  ('c-seed-003', 'HZ-2026-003', '铁路运输合同（邯黄铁路煤炭）', '运输合同', '河北泓泽宜通供应链管理有限公司', '沧州沧港铁路有限公司', NULL,
   3850000, 3850000, 3600000, 80000, 80000,
   DATE '2026-01-05', DATE '2026-06-30', '已完成'),
  ('c-seed-004', 'HZ-2026-004', '港口中转仓储服务合同', '服务合同', '河北泓泽宜通供应链管理有限公司', '河北陆港保税物流有限公司', NULL,
   1520000, 800000, 900000, 50000, 31500,
   DATE '2026-03-12', DATE '2027-03-11', '履行中'),
  ('c-seed-005', 'HZ-2026-005', '焦炭采购合同（山西一级焦）', '采购合同', '河北泓泽宜通供应链管理有限公司', '山西潞安焦化有限责任公司', NULL,
   9180000, 0, 4500000, 15000, 7300,
   DATE '2026-04-20', DATE '2026-10-19', '已终止')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, party_a = EXCLUDED.party_a, party_b = EXCLUDED.party_b,
  party_c = EXCLUDED.party_c, amount = EXCLUDED.amount, received = EXCLUDED.received, paid = EXCLUDED.paid,
  quantity = EXCLUDED.quantity, executed = EXCLUDED.executed, sign_date = EXCLUDED.sign_date,
  end_date = EXCLUDED.end_date, status = EXCLUDED.status, updated_at = now();
INSERT INTO contract.contract_template (id, name, type, content, sort_no)
VALUES
  ('tpl-seed-huoyun', '火运授权委托书', '授权委托书', $j${"id":"tpl-seed-huoyun","category":"授权委托书","versions":[{"ver":"V1.0","time":1789871400000,"name":"火运授权委托书","intro":"本模版适用于火车运输的货物授权","content":"本模板正文以内置静态文档形式展示，详见详情页。","risks":["1、确认提货码头","2、提货授权吨数及提货时间"],"remark":"初始版本","files":[]},{"ver":"V1.1","time":1792026360000,"name":"火运授权委托书","intro":"本模版适用于火车运输的货物授权","content":"本模板正文以内置静态文档形式展示，详见详情页。","risks":["1、确认提货码头","2、提货授权吨数及提货时间"],"remark":"完善提货授权条款","files":[]}]}$j$::jsonb, 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, content = EXCLUDED.content, updated_at = now();
