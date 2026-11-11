import { expect, it } from 'vitest';
import { searchTeacher } from '../../../src/ai_runtime/dual_v3/search_teacher';
import { teacherContract } from './teacher_contract';
it('锚定分布可消费，未闭合或否决标签必须为零', () => {
    const teacher = searchTeacher(['a', 'b', 'c'], [{ rootAction: 'a', value: .5, score: .1, responseComplete: true }, { rootAction: 'b', value: .9, score: .9, responseComplete: false }]);
    expect(teacherContract(teacher)).toBe(true);
    expect(teacherContract({ ...teacher, probabilities: [.9, .1, 0] })).toBe(false);
    expect(teacherContract(searchTeacher(['a'], []))).toBe(true);
});
