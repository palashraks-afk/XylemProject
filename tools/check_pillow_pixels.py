"""Read-only comparison of terrain decoding across Pillow installations."""
import hashlib
import json
from pathlib import Path
import PIL
from PIL import Image

root=Path(__file__).resolve().parents[1]
hashes={}
for path in sorted((root/'data/raw/extra/dem_z9').glob('*.png')):
    with Image.open(path) as image:
        rgb=image.convert('RGB')
        hashes[path.name]={'size':rgb.size,'sha256':hashlib.sha256(rgb.tobytes()).hexdigest()}
print(json.dumps({'pillow':PIL.__version__,'module':PIL.__file__,'rgb_pixels':hashes},indent=2))
