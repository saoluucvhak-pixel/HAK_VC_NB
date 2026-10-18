# VC Cost — Quản lý · Tính toán · Đối chiếu chi phí vận chuyển (offline)

Phiên bản **0.1.0** — hoàn thành Phase 1 (phân tích) & Phase 2 (thiết kế DB) theo `MASTER_PROMPT.md`, kèm lõi engine tính giá đã kiểm chứng khớp 100% với file Excel mẫu PRINCE OF NATURE V.47.

## Đọc gì trước
1. `docs/PHAN_TICH_THIET_KE_A-H.md` — phân tích file Excel + thiết kế A→H + **10 câu hỏi cần xác nhận (mục A.8)**.
2. `docs/EXCEL_VS_APP_VALIDATION.md` — kết quả engine so với Excel.
3. Các đặc tả: `docs/BUSINESS_RULES.md`, `DATABASE_SCHEMA.md`, `IMPORT_SPEC.md`, `PRICE_ENGINE_SPEC.md`, `RECONCILIATION_SPEC.md`, `UI_SPEC.md`, `TEST_PLAN.md`, `TODO_ROADMAP.md`.

## Chạy thử (cần Node.js ≥ 22.5)
```bash
npm install
npm test                                   # 24 unit test
npm run validate -- "duong-dan/file-mau.xlsx"   # so engine với Excel → docs/EXCEL_VS_APP_VALIDATION.md
```

## Cấu trúc
```
src/database/   migrator.js, migrations/001_init.sql
src/services/   FuelAdjustmentService, PriceResolver, VehicleResolver, TransportCostEngine,
                DuplicateDetector, TimeAnomalyService
src/excel/      columnMapping (dò header, từ đồng nghĩa), ticketParser
src/utils/      money (Decimal, làm tròn kiểu Excel), plate (biển số), datetime
data/seed/      sample-v47.json — danh mục & bảng giá rút từ file mẫu (dữ liệu, không phải code)
scripts/        validate-sample.js
tests/          engine.test.js, migration.test.js
docs/           tài liệu dự án
```

## Nguyên tắc
Không hard-code biển số, đơn vị, nơi xuất, đơn giá, VAT, giá dầu, km, 19 tấn, 35 L/100km · không sửa dữ liệu nguồn âm thầm · không tự xóa trùng · không tự gán xe · không tự chọn bảng giá khi xung đột · không tính lại chứng từ đã chốt khi chưa mở khóa.
