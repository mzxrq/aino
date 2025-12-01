# Stock Anomalies Detection System
---------------------------------------
<details open><summary>English </summary>
> This project reports on the development of a Stock Anomaly Detection System for the US, Japanese, and Thai markets. We built a web application to help retail investors find irregular market patterns using automated monitoring. The system operates on a hybrid architecture that combines a Python backend for heavy data processing with a Node.js service for secure user management.
> > To detect anomalies, we implemented the Isolation Forest algorithm. Unlike traditional methods that rely on simple price thresholds, our model analyzes eighteen distinct market indicators. These indicators include momentum, volatility, and candlestick morphology. By using this multi-factor approach, the system can identify complex statistical outliers that standard alerts might miss. The results are visualized on an interactive dashboard built with React and Plotly. Furthermore, we integrated the LINE Messaging API to push instant notifications to subscribers. This provides investors with a practical and automated early-warning tool for personal risk management.
</details>

<details><summary>Thai</summary>
โครงงานนี้นำเสนอการพัฒนาระบบตรวจจับความผิดปกติของตลาดหุ้นสำหรับตลาดสหรัฐอเมริกา ญี่ปุ่น และไทย โดยมีเป้าหมายเพื่อช่วยให้นักลงทุนรายย่อยสามารถตรวจสอบความเสี่ยงในตลาดได้ด้วยระบบติดตามอัตโนมัติ ระบบนี้ทำงานบนสถาปัตยกรรมแบบไฮบริดที่ใช้ Python ในการประมวลผลข้อมูลร่วมกับ Node.js สำหรับการจัดการผู้ใช้งาน
ในส่วนของการวิเคราะห์ เราใช้อัลกอริทึม Isolation Forest เพื่อประเมินตัวชี้วัดทางตลาดกว่า 18 รายการ ซึ่งรวมถึงค่าโมเมนตัม ความผันผวน และรูปร่างของกราฟแท่งเทียน วิธีการนี้ช่วยให้ระบบสามารถค้นหาความผิดปกติทางสถิติที่ซับซ้อนได้แม่นยำกว่าการดูราคาเพียงอย่างเดียว ผลลัพธ์จะถูกแสดงผ่านแดชบอร์ดแบบ Interactive ที่พัฒนาด้วย React และมีการเชื่อมต่อกับ LINE Messaging API เพื่อส่งแจ้งเตือนให้นักลงทุนทราบทันทีเมื่อตรวจพบสัญญาณความผิดปกติ ซึ่งถือเป็นเครื่องมือช่วยบริหารความเสี่ยงที่มีประสิทธิภาพ
</details>
<details><summary>日本語</summary>
本プロジェクトでは、米国、日本、およびタイ市場を対象とした株式異常検知システムを開発しました。このWebアプリケーションは、個人投資家が市場の不規則な動きを自動監視によって把握できるように設計されています。システムはデータ処理用のPythonとユーザー管理用のNode.jsを組み合わせたハイブリッド構成で動作します。
異常検知にはIsolation Forestアルゴリズムを採用しました。ここでは単純な価格設定ではなく、モメンタムやボラティリティ、ローソク足の形状など18種類の指標を分析します。これにより、従来の手法では見逃されがちな統計的な異常値を特定することが可能になりました。検知結果はReactを用いた対話型ダッシュボードで可視化され、LINE Messaging APIを通じてユーザーへ即座に通知されるため、実用的な早期警戒ツールとして機能します。
</details>
