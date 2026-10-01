"""Пересборка GLB: оставляет только нужные анимации (или ни одной) и выкидывает неиспользуемые данные.

python3 tools/glb_strip.py in.glb out.glb [--keep Idle,Walk,...] [--no-mesh]
--keep  — имена клипов без префикса «CharacterArmature|»; без флага анимации удаляются целиком
--no-mesh — оставить только скелет и анимации (общий файл анимаций для всех персонажей)
"""
import json, struct, sys

def read_glb(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF'
    off, j, binb = 12, None, b''
    while off < len(b):
        ln, typ = struct.unpack('<II', b[off:off + 8])
        chunk = b[off + 8:off + 8 + ln]
        if typ == 0x4E4F534A: j = json.loads(chunk)
        elif typ == 0x004E4942: binb = chunk
        off += 8 + ln
    return j, binb

def write_glb(path, j, binb):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    binb += b'\0' * ((4 - len(binb) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binb)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(binb), 0x004E4942)); f.write(binb)

def main():
    a = sys.argv[1:]
    src, dst = a[0], a[1]
    keep = set()
    if '--keep' in a: keep = set(a[a.index('--keep') + 1].split(','))
    j, binb = read_glb(src)
    anims = [x for x in j.get('animations', []) if x['name'].split('|')[-1] in keep]
    for x in anims: x['name'] = x['name'].split('|')[-1]
    j['animations'] = anims
    if not anims: j.pop('animations')
    if '--no-mesh' in a:
        # остаётся иерархия костей; меши и материалы не нужны
        for n in j['nodes']: n.pop('mesh', None); n.pop('skin', None)
        for k in ('meshes', 'materials', 'skins'): j.pop(k, None)
    # какие accessor'ы реально используются
    used = set()
    for m in j.get('meshes', []):
        for p in m['primitives']:
            used.update(p['attributes'].values())
            if 'indices' in p: used.add(p['indices'])
            for t in p.get('targets', []): used.update(t.values())
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: used.add(s['inverseBindMatrices'])
    for an in j.get('animations', []):
        for s in an['samplers']: used.update([s['input'], s['output']])
    acc_map, new_acc = {}, []
    for i, acc in enumerate(j['accessors']):
        if i in used: acc_map[i] = len(new_acc); new_acc.append(acc)
    used_bv = sorted({acc['bufferView'] for acc in new_acc if 'bufferView' in acc})
    bv_map, new_bv, out = {}, [], bytearray()
    for i in used_bv:
        bv = dict(j['bufferViews'][i])
        data = binb[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        while len(out) % 4: out += b'\0'
        bv['byteOffset'] = len(out); bv['buffer'] = 0
        out += data
        bv_map[i] = len(new_bv); new_bv.append(bv)
    for acc in new_acc:
        if 'bufferView' in acc: acc['bufferView'] = bv_map[acc['bufferView']]
    j['accessors'], j['bufferViews'] = new_acc, new_bv
    for m in j.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = acc_map[p['indices']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    for an in j.get('animations', []):
        for s in an['samplers']: s['input'], s['output'] = acc_map[s['input']], acc_map[s['output']]
    j['buffers'] = [{'byteLength': len(out)}]
    write_glb(dst, j, bytes(out))
    print(f'{dst}: {len(out) / 1024:.0f} KB, anims {[x["name"] for x in j.get("animations", [])]}')

main()
