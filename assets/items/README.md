# 示例物品配图

这六张写实风格图片使用内置 imagegen 生成，仅用于演示信息，不能作为实际失物照片或真实认领凭证。真实发布应上传物品照片。

图片以 JPG 格式随项目提供，尺寸为 1080 × 720，无需联网加载。浏览器卡片与详情共用同一张图片，旧版本保存的示例记录也会自动显示对应配图。用户上传的照片优先显示。

## 文件对应关系

| 文件 | 对应名称与特征 |
| --- | --- |
| campus-card.jpg | 蓝色校园卡：蓝色卡套、蓝色挂绳、小兔贴纸，卡片个人信息模糊处理 |
| wireless-earbuds.jpg | 白色无线耳机：白色充电盒、两只耳机、轻微使用痕迹 |
| keys.jpg | 一串钥匙：三把银色钥匙、绿色挂件 |
| math-notebook.jpg | 高等数学笔记本：黑色活页封面、手写微积分笔记 |
| canvas-bag.jpg | 米色帆布包：米色布料、两条提手、自然褶皱 |
| thermos.jpg | 黑色保温杯：黑色磨砂杯身、银色挂环 |

## 生成提示词

六张图片分别生成，使用以下公共提示词与各自的 Subject 段落拼接。工具：内置 imagegen；未使用 CLI 或外部图片素材。

### 公共提示词

Use case: photorealistic-natural. Asset type: one sample item photo for a Chinese campus lost-and-found web app. Create a single realistic photograph, not a collage, illustration, icon, CGI or rendered mockup. Natural daylight, authentic material texture and slight signs of daily use. One main object centered on a light neutral classroom desk, subtle soft shadow, calm muted color palette. Landscape 3:2 photograph, entire object visible inside the central 65 percent so both landscape and square card crops work. No people, no hands, no text overlays, no watermarks, no readable personal information, no brands.

### campus-card.jpg

Subject: one blue plastic campus ID-card holder containing a generic student ID card, viewed slightly from above on the desk. Blue lanyard gently coiled behind it, little rabbit sticker on the holder. The blue card holder is the main object. Card information deliberately blurred and unreadable, no identifiable face.

### wireless-earbuds.jpg

Subject: one white wireless earbud charging case sitting open with two white earbuds resting neatly inside it, viewed close up from slightly above on the desk. Smooth glossy white plastic, tiny realistic surface scuffs, hinge and interior contours, subtle indicator dot. Only this white earbud set.

### keys.jpg

Subject: one ordinary metal keyring holding three silver house keys and one green fabric keychain charm, laid flat on the light desk. Keys and green charm distinctly visible, natural scratches and metal highlights, entire set in view.

### math-notebook.jpg

Subject: one black covered binder-style mathematics notebook on the desk, cover partly open showing off-white handwritten calculus notes and formulas. Black cover, silver binder loops, paper grain, a few handwritten curves and equations. No other objects, no books stacked behind it.

### canvas-bag.jpg

Subject: one beige canvas tote bag with two beige fabric handles laid neatly on a light desk, natural fabric folds and clearly visible cotton weave, handles fully visible, plain practical school tote bag without a logo. Beige tote only, not a backpack.

### thermos.jpg

Subject: one black cylindrical insulated thermos bottle standing upright on a light desk. Matte black metal finish, closed black screw lid with a thin silver metal band and a small silver carry loop beside the lid. Entire thermos visible, realistic everyday wear, no logo, no cup or other objects.
