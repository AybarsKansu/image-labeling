import os
from datetime import datetime
from ultralytics import YOLO

def train_custom_model():
    # --- AYARLAR ---
    # Roboflow'dan inen klasörün içindeki data.yaml yolunu buraya tam olarak yazın
    dataset_yaml_path = "/home/aybars_kansu_han/Desktop/first/backend/Air Borne Objects.v4i.yolov8/data.yaml"
    
    # Model ismi (Örn: v4_egitimi)
    base_model_name = "roboflow_v4_egitimi"
    
    # Batch size (Ekran kartı hafızasına göre 1, 2, 4 veya 8 yapın)
    batch_size = 2
    
    # Epoch sayısı
    epochs = 50
    # ----------------

    # 1. Dinamik Model İsmi Oluşturma (Tarih-Saat ekli)
    # Örnek çıktı: roboflow_v4_egitimi_20231027_1530
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    run_name = f"{base_model_name}_{timestamp}"

    print(f"Calisma dizini: {os.getcwd()}")
    print(f"Dataset yolu: {dataset_yaml_path}")
    print(f"Egitilecek model ismi: {run_name}")

    # 2. Dataset Dosya Kontrolü
    if not os.path.exists(dataset_yaml_path):
        print(f"data.yaml dosyasi bulunamadi: {dataset_yaml_path}")
        return

    # 3. Modeli Yükle
    # Eger sifirdan egitimse 'yolov8n-seg.pt' veya 'yolov8m-seg.pt'
    # Eger onceki bir egitimden devam ise 'runs/.../best.pt'
    print("Temel model yukleniyor (yolov8m)...")
    model = YOLO('yolov8m.pt') 

    # 4. Eğitimi Başlat
    print(f"Egitim baslatiliyor. Epoch: {epochs}, Batch: {batch_size}")
    
    try:
        results = model.train(
            data=dataset_yaml_path,
            epochs=epochs,
            imgsz=640,
            batch=batch_size,
            name=run_name,
            device=0, # Eger GPU yoksa 'cpu' yapin, varsa 0
            exist_ok=True # Ayni isim varsa uzerine yazmasina izin ver (zaten timestamp var)
        )
        
        print("Egitim basariyla tamamlandi.")
        print(f"Yeni modelin kaydedildigi yer: runs/segment/{run_name}/weights/best.pt")
        
    except Exception as e:
        print(f"Egitim sirasinda bir hata olustu: {e}")

if __name__ == '__main__':
    train_custom_model()