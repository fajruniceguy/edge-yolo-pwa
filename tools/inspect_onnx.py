import argparse
import os
from collections import Counter

import onnx


def dtype_name(elem_type):
    return onnx.TensorProto.DataType.Name(elem_type)


def shape_str(value_info):
    dims = value_info.type.tensor_type.shape.dim
    parts = []
    for d in dims:
        if d.dim_value:
            parts.append(str(d.dim_value))
        elif d.dim_param:
            parts.append(d.dim_param)
        else:
            parts.append("?")
    return "[" + ", ".join(parts) + "]"


def describe_io(value_info):
    elem_type = value_info.type.tensor_type.elem_type
    return f"{value_info.name}: {shape_str(value_info)} {dtype_name(elem_type)}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model_path", nargs="?", default="model/best.onnx")
    args = parser.parse_args()

    size_mb = os.path.getsize(args.model_path) / (1024 * 1024)
    model = onnx.load(args.model_path)

    print(f"file: {args.model_path} ({size_mb:.2f} MB)")
    print(f"ir_version: {model.ir_version}")
    opsets = ", ".join(f"{o.domain or 'ai.onnx'}={o.version}" for o in model.opset_import)
    print(f"opset: {opsets}")

    print("inputs:")
    for vi in model.graph.input:
        print(f"  {describe_io(vi)}")

    print("outputs:")
    for vi in model.graph.output:
        print(f"  {describe_io(vi)}")

    op_counts = Counter(node.op_type for node in model.graph.node)
    print(f"nodes: {sum(op_counts.values())} total, {len(op_counts)} distinct op types")
    print("top 15 op types:")
    for op_type, count in op_counts.most_common(15):
        print(f"  {op_type}: {count}")


if __name__ == "__main__":
    main()
