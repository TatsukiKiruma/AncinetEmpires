import os

def merge_data():
    data_dir = 'ai_training/r7_training_stage_20261014_083500/artifacts/data'
    base_train = os.path.join(data_dir, 'train_samples.jsonl')
    dagger_data = os.path.join(data_dir, 'dagger_samples.jsonl')
    round2_train = os.path.join(data_dir, 'round2_train_samples.jsonl')

    total_base = 0
    total_dagger = 0

    with open(round2_train, 'w', encoding='utf-8') as fout:
        with open(base_train, 'r', encoding='utf-8') as f_base:
            for line in f_base:
                if line.strip():
                    fout.write(line)
                    total_base += 1

        with open(dagger_data, 'r', encoding='utf-8') as f_dag:
            for line in f_dag:
                if line.strip():
                    fout.write(line)
                    total_dagger += 1

    print(f"Merged Round 2 Training Data:")
    print(f"  Base Training Samples: {total_base}")
    print(f"  DAgger Corrective Samples: {total_dagger}")
    print(f"  Total Round 2 Samples: {total_base + total_dagger}")
    print(f"Saved to: {round2_train}")

if __name__ == '__main__':
    merge_data()
