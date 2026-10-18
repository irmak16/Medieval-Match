"""Render cartoon debris sprites (wood splinters, stone chunks, leaves, chain links) with Blender (bpy).
Usage: python3 blender_debris.py OUT_DIR
"""
import sys, math, random, os
import bpy, bmesh
from mathutils import Vector, Euler

OUT = sys.argv[-1]
os.makedirs(OUT, exist_ok=True)
random.seed(7)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = False
    sc.render.film_transparent = True
    sc.render.resolution_x = 128
    sc.render.resolution_y = 128
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    # world light
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.85, 0.8, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    # camera
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = 2.4
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    co.location = (0, 0, 10)
    sc.camera = co
    # key light (warm, from top-left) + rim
    for name, loc, energy, col in [("key", (-4, 5, 8), 2.6, (1, 0.95, 0.85)), ("rim", (5, -4, 3), 1.2, (0.9, 0.9, 1))]:
        l = bpy.data.lights.new(name, "SUN")
        l.energy = energy
        l.color = col
        lo = bpy.data.objects.new(name, l)
        sc.collection.objects.link(lo)
        lo.rotation_euler = (Vector(loc)).to_track_quat("Z", "Y").to_euler()
    return sc


def material(name, base, rough=0.45, metal=0.0, tex=None, tex_scale=6.0, tex_mix=0.35):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if tex:
        t = nt.nodes.new("ShaderNodeTexWave" if tex == "wave" else "ShaderNodeTexNoise")
        t.inputs["Scale"].default_value = tex_scale
        if tex == "wave":
            t.inputs["Distortion"].default_value = 6
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = tuple(c * (1 - tex_mix) for c in base[:3]) + (1,)
        ramp.color_ramp.elements[1].color = base
        nt.links.new(t.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])
    else:
        p.inputs["Base Color"].default_value = base
    return m


def outline_mat():
    m = bpy.data.materials.new("outline")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.09, 0.04, 0.02, 1)
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def add_outline(obj, thick=0.05):
    return  # outline is added in 2D post-process (tools/fx_post.py)
    # inverted hull as a separate child object
    me = obj.data.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * thick
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(outline_mat())
    hull = bpy.data.objects.new("hull", me)
    bpy.context.scene.collection.objects.link(hull)
    hull.parent = obj
    hull.visible_shadow = False
    hull.visible_diffuse = False
    hull.visible_glossy = False
    hull.visible_transmission = False


def finish(obj, mat, name, outline=0.05):
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    add_outline(obj, outline)
    obj.rotation_euler = Euler((random.uniform(-0.6, 0.6), random.uniform(-0.6, 0.6), random.uniform(0, 6.28)))
    bpy.context.scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name)


def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def jitter(bm, amt):
    for v in bm.verts:
        v.co += Vector((random.uniform(-amt, amt), random.uniform(-amt, amt), random.uniform(-amt, amt)))


# ---------- wood splinters ----------
for i in range(4):
    reset()
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2)
    L = random.uniform(1.6, 2.0)
    for v in bm.verts:
        x = v.co.x
        taper = 1.0 - abs(x) * random.uniform(0.6, 0.9)  # pointy ends
        v.co.x *= L
        v.co.y *= 0.42 * max(taper, 0.12)
        v.co.z *= 0.18 * max(taper, 0.2)
    jitter(bm, 0.05)
    ob = mesh_obj("wood", bm)
    finish(ob, material("wood", (0.36, 0.16, 0.07, 1), 0.6, tex="wave", tex_scale=3, tex_mix=0.4), f"fx_wood{i+1}")

# ---------- stone chunks ----------
for i in range(4):
    reset()
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.75)
    for v in bm.verts:
        v.co.x *= random.uniform(0.8, 1.2)
        v.co.z *= 0.7
    jitter(bm, 0.2)
    ob = mesh_obj("stone", bm)
    finish(ob, material("stone", (0.36, 0.38, 0.42, 1), 0.8, tex="noise", tex_scale=4, tex_mix=0.3), f"fx_stone{i+1}")

# ---------- leaves ----------
for i in range(3):
    reset()
    bm = bmesh.new()
    n = 14
    pts = []
    for k in range(n):
        t = k / (n - 1)
        x = -1 + 2 * t
        w = math.sin(math.pi * t) ** 0.8 * 0.5
        pts.append((x, w))
    outline = pts + [(x, -w) for x, w in reversed(pts[1:-1])]
    verts = [bm.verts.new((x, y, 0.15 * (x * x))) for x, y in outline]
    bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += 0.09
    ob = mesh_obj("leaf", bm)
    finish(ob, material("leaf", (0.08, 0.42, 0.06, 1), 0.5), f"fx_leaf{i+1}", outline=0.035)

# ---------- chain links ----------
for i in range(2):
    reset()
    bpy.ops.mesh.primitive_torus_add(major_radius=0.7, minor_radius=0.18, major_segments=24, minor_segments=10)
    ob = bpy.context.active_object
    ob.scale = (1.0, 0.62, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    m = material("steel", (0.6, 0.62, 0.66, 1), 0.3, metal=0.9)
    ob.data.materials.append(m)
    for p in ob.data.polygons:
        p.use_smooth = True
    add_outline(ob, 0.04)
    ob.rotation_euler = Euler((random.uniform(-0.9, 0.9), random.uniform(-0.5, 0.5), random.uniform(0, 6.28)))
    bpy.context.scene.render.filepath = os.path.join(OUT, f"fx_link{i+1}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", f"fx_link{i+1}")
