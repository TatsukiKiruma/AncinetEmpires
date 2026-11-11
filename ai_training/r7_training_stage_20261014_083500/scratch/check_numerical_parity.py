import json
import numpy as np

def check_parity():
    py_path = 'ai_training/r7_training_stage_20261014_083500/artifacts/py_predictions.json'
    ts_path = 'ai_training/r7_training_stage_20261014_083500/artifacts/ts_predictions.json'

    with open(py_path, 'r', encoding='utf-8') as f:
        py_data = json.load(f)
    with open(ts_path, 'r', encoding='utf-8') as f:
        ts_data = json.load(f)

    assert len(py_data) == len(ts_data), f"Length mismatch: {len(py_data)} vs {len(ts_data)}"

    total_samples = len(py_data)
    total_logits = 0
    max_logit_abs_err = 0.0
    sum_logit_abs_err = 0.0

    max_val_abs_err = 0.0
    sum_val_abs_err = 0.0

    argmax_matches = 0
    tolerance = 1e-4

    failed_samples = []

    for i in range(total_samples):
        p = py_data[i]
        t = ts_data[i]
        sample_id = p['sampleId']

        # 检查 value 误差
        v_err = abs(p['value'] - t['value'])
        if v_err > max_val_abs_err:
            max_val_abs_err = v_err
        sum_val_abs_err += v_err

        # 检查 logits 误差
        p_logits = p['actionLogits']
        t_logits = t['actionLogits']
        assert len(p_logits) == len(t_logits), f"Sample {sample_id} logits length mismatch: {len(p_logits)} vs {len(t_logits)}"

        sample_max_err = 0.0
        for l_p, l_t in zip(p_logits, t_logits):
            total_logits += 1
            err = abs(l_p - l_t)
            if err > max_logit_abs_err:
                max_logit_abs_err = err
            if err > sample_max_err:
                sample_max_err = err
            sum_logit_abs_err += err

        # 检查 argmax
        p_arg = p['argmaxIndex']
        t_arg = t['argmaxIndex']
        if p_arg == t_arg:
            argmax_matches += 1
        else:
            failed_samples.append({
                'sampleId': sample_id,
                'p_arg': p_arg,
                't_arg': t_arg,
                'sample_max_err': sample_max_err
            })

    mean_logit_abs_err = sum_logit_abs_err / max(1, total_logits)
    mean_val_abs_err = sum_val_abs_err / total_samples

    print(f"===========================================================")
    print(f"Python vs TypeScript Numerical Parity Verification Report")
    print(f"===========================================================")
    print(f"Total States Tested: {total_samples}")
    print(f"Total Action Logits Tested: {total_logits}")
    print(f"Value Max Absolute Error: {max_val_abs_err:.8f}")
    print(f"Value Mean Absolute Error: {mean_val_abs_err:.8f}")
    print(f"Logits Max Absolute Error: {max_logit_abs_err:.8f}")
    print(f"Logits Mean Absolute Error: {mean_logit_abs_err:.8f}")
    print(f"Tolerance Threshold: {tolerance}")
    print(f"Argmax Match Rate: {argmax_matches}/{total_samples} ({(argmax_matches/total_samples*100):.2f}%)")
    print(f"Failed Samples Count: {len(failed_samples)}")

    parity_passed = (max_logit_abs_err < tolerance) and (max_val_abs_err < tolerance) and (argmax_matches == total_samples)
    print(f"Numerical Parity Check Passed: {parity_passed}")

    # 保存报告到 JSON
    report = {
        'totalStates': total_samples,
        'totalLogits': total_logits,
        'valueMaxAbsErr': max_val_abs_err,
        'valueMeanAbsErr': mean_val_abs_err,
        'logitsMaxAbsErr': max_logit_abs_err,
        'logitsMeanAbsErr': mean_logit_abs_err,
        'tolerance': tolerance,
        'argmaxMatchRate': argmax_matches / total_samples,
        'failedSamples': failed_samples,
        'parityPassed': parity_passed
    }

    with open('ai_training/r7_training_stage_20261014_083500/artifacts/parity_verification_report.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)

if __name__ == '__main__':
    check_parity()
