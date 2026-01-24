import sys
import shutil
import yaml
import os
from pathlib import Path

def import_data(source_path):
    source = Path(source_path).resolve()
    if not source.exists():
        print(f"Error: Path {source} does not exist.")
        return

    # Backend Root (assuming this script is in backend/)
    backend_root = Path(__file__).parent
    target_root = backend_root / "dataset"
    target_imgs = target_root / "images"
    target_lbls = target_root / "labels"
    
    # Ensure clean slate? Or append? Let's append/overwrite.
    target_imgs.mkdir(parents=True, exist_ok=True)
    target_lbls.mkdir(parents=True, exist_ok=True)
    
    print(f"Importing from {source} to {target_root}...")

    # 1. Parse yaml for classes
    # Look for data.yaml or *.yaml
    yaml_files = list(source.glob("*.yaml"))
    if yaml_files:
        yaml_path = yaml_files[0]
        try:
            with open(yaml_path, 'r') as f:
                data = yaml.safe_load(f)
                names = data.get('names', [])
                if isinstance(names, dict):
                    names = sorted(names.values()) # Handle {0: 'a', 1: 'b'}
                
                # Write to classes.txt (Master Registry will initialize from this if new)
                # Note: This overwrites local classes.txt. 
                # Ideally we merge, but for a "Fresh Import" this is safer.
                with open(target_root / "classes.txt", "w") as cf:
                    for n in names:
                        cf.write(f"{n}\n")
                print(f"✅ Imported {len(names)} classes from {yaml_path.name}")
        except Exception as e:
            print(f"⚠️ Failed to parse YAML: {e}")

    # 2. Copy Files
    # Handle standard structure: source/{train,valid,test}/{images,labels}
    # Also handle flat structure if present
    
    count_img = 0
    count_lbl = 0

    subsets = ['train', 'valid', 'test']
    
    # Check if direct images folder exists
    if (source / "images").exists():
        # Maybe flats structure like source/images/train
        pass

    for split in subsets:
        # Check source/split/images
        s_img_dir = source / split / "images"
        s_lbl_dir = source / split / "labels"
        
        # If not there, try source/images/split (YOLOv5 style sometimes)
        if not s_img_dir.exists():
            s_img_dir = source / "images" / split
            s_lbl_dir = source / "labels" / split

        if s_img_dir.exists():
            print(f"Processing {split}...")
            # Copy Images
            for img in s_img_dir.glob("*.*"):
                if img.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp']:
                    # Use unique name to avoid collisions between splits?
                    # source data usually unique. but let's be safe?
                    # actually simple Copy is requested.
                    shutil.copy(img, target_imgs / img.name)
                    count_img += 1
            
            # Copy Labels
            if s_lbl_dir.exists():
                for lbl in s_lbl_dir.glob("*.txt"):
                    shutil.copy(lbl, target_lbls / lbl.name)
                    count_lbl += 1
        else:
            # Maybe the folder IS the slit?
            pass

    print(f"✅ Import Complete!")
    print(f"   Images: {count_img}")
    print(f"   Labels: {count_lbl}")
    print(f"\nNow restart the backend to refresh cache, then go to UI > Train > Advanced.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python import_data.py /absolute/path/to/downloaded/dataset")
    else:
        import_data(sys.argv[1])
