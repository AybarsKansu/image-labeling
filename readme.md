Bağımsız Yardımcı Fonksiyonlar (Component Dışı)
stringToColor
: String'den renk üretir.
distanceToSegment
: Noktanın doğru parçasına uzaklığını hesaplar.
doBoxesIntersect
: İki kutunun kesişip kesişmediğini kontrol eder.
getPolyBounds
: Poligon sınırlarını hesaplar.
getLineBounds
: Çizgi sınırlarını hesaplar.
AnnotationApp (Ana Bileşen)
State ve Effect Hooks: (Kod içinde görünmez ama fonksiyonların temelini oluşturur)
Event Handlers (Doğrudan Kullanıcı Etkileşimi)
handleImageUpload
: Resim yükleme işlemini yönetir.
handleStageClick
: Sahneye tıklamayı yönetir (seçim kaldırma).
handleMouseDown
: Çizim başlatma, nokta ekleme işlemlerini başlatır.
handleMouseMove
: Çizim sırasında fare hareketini, silgi ve bıçak önizlemesini yönetir.
handleMouseUp
: Çizimi tamamlama, AI kutusu gönderme, bıçakla kesme işlemlerini bitirir.
handleVertexDrag
: Poligon köşe noktalarını sürüklemeyi yönetir.
handleWheel
: Zoom ve pan işlemlerini yönetir.
handleKeyDown
: Klavye kısayollarını (Delete, Undo, vb.) yönetir.
handleResize
: Pencere boyutlandırmasını yönetir.
handleCancelTraining
: Eğitimi iptal etme isteğini yönetir.
handlePanelMouseMove
: Panel sürükleme/boyutlandırma fare hareketi.
handlePanelMouseUp
: Panel sürükleme/boyutlandırma bitişi.
Action Handlers (Butonlar/Araç Çubuğu ile Tetiklenenler)
handleDetectAll
: Tüm nesneleri tespit et (AI).
handleSaveAnnotation
: Etiketleri kaydet.
handleUndo
: Geri al.
handleRedo
: İleri al.
handleClearAll
: Tümünü temizle.
updateLabel
: Seçili etiketin ismini güncelle.
deleteSelected
: Seçili etiketleri sil.
fetchModels
: Mevcut modelleri backend'den çek.
handleSimplify
: Poligonu basitleştir.
handleDensify
: Poligonu yoğunlaştır (nokta ekle).
handleReset
: Poligonu orijinal haline döndür (Unsimplify).
handleBeautify
: Poligonu güzelleştir (Right angle smoothing).
Dahili Yardımcı Fonksiyonlar (Component İçi)
getRelativePointerPosition
: Zoom/pan hesaba katarak fare pozisyonunu alır.
pointInPolygon
: Bir noktanın poligon içinde olup olmadığını test eder.
getClickedShape
: Tıklanan noktadaki şekli bulur (Ters sırayla tarar).
addToHistory
: Mevcut durumu geçmişe ekler.
simplifyPoints
: Ramer-Douglas-Peucker algoritması ile noktaları azaltır.
getSqDist
: İki nokta arası kare uzaklık.
getSqSegDist
: Noktanın doğru parçasına kare uzaklığı.
simplifyDP
: Recursive basitleştirme fonksiyonu.